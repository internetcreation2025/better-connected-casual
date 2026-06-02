import { NextRequest } from 'next/server'
// @ts-ignore — plain ESM module, no type declarations needed
import { sanitize } from '../../lib/sanitize.mjs'
// @ts-ignore — plain ESM module, no type declarations needed
import { injectNewsGrid, injectDirectoryGrid, injectDocumentsGrid, injectHomeSearch, injectMarquee, injectCarousels } from '../../lib/grids.mjs'
// @ts-ignore — plain ESM module, no type declarations needed
import { injectForms } from '../../lib/forms.mjs'

const SITE = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')
const USER = process.env.WP_API_USERNAME ?? ''
const PASS = process.env.WP_API_PASSWORD ?? ''
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

// First path segment of anything we must NOT serve on the public mirror.
const EXCLUDE = new Set([
  // account / auth
  'log-in', 'register', 'register-casual', 'account', 'profile', 'password-reset',
  // restricted / out of scope
  'directors-directory', 'our-people-forum', 'wpum_directory',
  // PDR + workflows
  'pdr-review', 'pdr-workflow-inbox', 'pdr-workflow-status', 'pdr-workflow-submit', 'pdr-supporting-information',
  // forms (still out of scope: drafts, duplicates, sensitive/later tiers)
  'nominate-a-team', 'nominate-a-colleague',
  'survery-request-form', 'employee-recognition',
  'venue-event-incident-report-form',
  'free-staff-active-card', 'data-protection-info-form-3',
  'agreement-to-mediate', 'confidentiality-agreement', 'raffle', 'free-club-membership',
  'friends-family-membership-discount', 'email-toolkit',
])

// Hosts allowed to serve content. Vercel "Standard Protection" gates every URL EXCEPT
// the public production domain — so we serve ONLY on the auth-protected git-branch alias
// (and localhost for dev), and 503 everywhere else. The public production domain
// (better-connected-casual.vercel.app) therefore never serves staff content.
const SERVE_HOSTS = new Set([
  // Custom staff domain (primary).
  'casual.betterconnected.me',
  // Vercel domains — safe to serve because middleware.ts password-gates every request
  // on every host (fails closed if the password env vars are unset).
  'better-connected-casual.vercel.app',
  'better-connected-casual-git-main-internet-creations-projects.vercel.app',
  'localhost:3000',
  'localhost:3100',
])

export async function GET(
  req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  // SAFETY: only serve when explicitly enabled AND on a protection-gated host.
  const host = req.headers.get('host') || ''
  if (process.env.BCC_PREVIEW_ENABLED !== '1' || !SERVE_HOSTS.has(host)) {
    return new Response('Preview is offline.', { status: 503 })
  }

  const slug = (params.slug ?? []).join('/')
  const first = slug.split('/')[0]
  if (first && EXCLUDE.has(first)) {
    return new Response('Not found', { status: 404 })
  }

  // WordPress permalinks are canonical with a trailing slash; match exactly so the
  // loopback render doesn't 301 (which redirection=0 would turn into a non-200).
  const canonical = slug ? `/${slug}/` : '/'
  const renderUrl = `${SITE}/wp-json/bcc/v1/render?path=${encodeURIComponent(canonical)}`
  let data: { status: number; html: string }
  try {
    const res = await fetch(renderUrl, {
      headers: { Authorization: AUTH },
      // 5-min self-healing cache; tagged so the WP webhook can purge it instantly.
      next: { revalidate: 300, tags: ['bcc'] },
    })
    if (!res.ok) return new Response('Upstream error', { status: 502 })
    data = await res.json()
  } catch {
    return new Response('Upstream error', { status: 502 })
  }

  // Casual render redirects/404s for anything a casual user can't see → treat as not found.
  if (data.status !== 200 || !data.html) {
    return new Response('Not found', { status: 404 })
  }

  let html = sanitize(data.html)
  // Header announcement marquee (ticker) — present on every page.
  html = injectMarquee(html)
  // Splide/Kadence gallery carousels — make them swipeable without JS.
  html = injectCarousels(html)
  // Native Forminator form rebuilds — forms can appear on any page, so run always.
  try {
    html = await injectForms(html, slug)
  } catch (e) {
    console.log(`form injection failed for ${slug}:`, (e as Error).message)
  }
  // Native grid rebuilds for JS-driven WP Grid Builder pages.
  const injectors: Record<string, (h: string) => Promise<string>> = {
    '': injectHomeSearch,
    news: injectNewsGrid,
    'staff-directory': injectDirectoryGrid,
    'main-directory': injectDocumentsGrid,
  }
  if (injectors[slug]) {
    try {
      html = await injectors[slug](html)
    } catch (e) {
      console.log(`grid injection failed for ${slug}:`, (e as Error).message)
    }
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // No CDN HTML caching: speed comes from the tagged WP data cache above, which the
      // /api/revalidate webhook can purge on demand for instant live-sync. (A manual
      // CDN s-maxage here couldn't be purged by tag, so edits would lag up to its TTL.)
      'cache-control': 'no-store',
    },
  })
}
