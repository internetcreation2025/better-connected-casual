import { NextRequest } from 'next/server'
// @ts-ignore — plain ESM module, no type declarations needed
import { sanitize } from '../../lib/sanitize.mjs'

const SITE = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')
const USER = process.env.WP_API_USERNAME ?? ''
const PASS = process.env.WP_API_PASSWORD ?? ''
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

// First path segment of anything we must NOT serve on the public mirror.
const EXCLUDE = new Set([
  // account / auth
  'log-in', 'register', 'register-casual', 'account', 'profile', 'password-reset',
  // restricted / out of scope
  'directors-directory', 'our-people-forum',
  // PDR + workflows
  'pdr-review', 'pdr-workflow-inbox', 'pdr-workflow-status', 'pdr-workflow-submit', 'pdr-supporting-information',
  // forms
  'nominate-a-team', 'nominate-a-colleague', 'quarterly-nomination-form', 'special-recognition-nomination-form',
  'survey-request-form', 'survery-request-form', 'fslt-newsletter-submission-form', 'employee-recognition',
  'venue-event-incident-report-form', 'safety-pulse-questions-suggestions', 'myzone-request-form',
  'portal-feedback-form', 'mad-ideas-submission-form', 'free-staff-active-card', 'data-protection-info-form-3',
  'agreement-to-mediate', 'confidentiality-agreement', 'raffle', 'free-club-membership',
  'friends-family-membership-discount', 'become-a-wellbeing-champion', 'email-toolkit',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug?: string[] } }
) {
  // SAFETY KILL-SWITCH: serve nothing unless explicitly enabled. Set the env var
  // BCC_PREVIEW_ENABLED=1 only AFTER deployment protection is confirmed to gate this
  // deployment. Off by default so content is never public by accident.
  if (process.env.BCC_PREVIEW_ENABLED !== '1') {
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
      next: { revalidate: 300 }, // live-sync with a 5-min cache
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

  const html = sanitize(data.html)
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // CDN caches for 5 min, serves stale while revalidating
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
