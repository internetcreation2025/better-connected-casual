import { NextRequest } from 'next/server'

const SITE = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')

// Same host gate as the page proxy: only serve on protection-gated hosts.
const SERVE_HOSTS = new Set([
  // Custom staff domain (primary). Safe to serve: middleware.ts password-gates every request.
  'casual.betterconnected.me',
  'better-connected-casual.vercel.app',
  'better-connected-casual-git-main-internet-creations-projects.vercel.app',
  'localhost:3000',
  'localhost:3100',
])

// First path segment of results we must not surface (mirror exclude list).
const EXCLUDE = new Set([
  'log-in', 'register', 'register-casual', 'account', 'profile', 'password-reset',
  'directors-directory', 'our-people-forum', 'wpum_directory', 'pdr-review', 'pdr-workflow-inbox',
  'pdr-workflow-status', 'pdr-workflow-submit', 'pdr-supporting-information',
])

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || ''
  if (process.env.BCC_PREVIEW_ENABLED !== '1' || !SERVE_HOSTS.has(host)) {
    return Response.json({ results: [] }, { status: 503 })
  }
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return Response.json({ results: [] })

  try {
    const r = await fetch(
      `${SITE}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=10&_fields=title,url,subtype`,
      { next: { revalidate: 60 } }
    )
    if (!r.ok) return Response.json({ results: [] }, { status: 502 })
    const data = (await r.json()) as Array<{ title: string; url: string; subtype: string }>
    const results = data
      .map((x) => ({ title: x.title, url: (x.url || '').replace(SITE, ''), subtype: x.subtype }))
      .filter((x) => !EXCLUDE.has((x.url || '').replace(/^\//, '').split('/')[0]))
    return Response.json({ results })
  } catch {
    return Response.json({ results: [] }, { status: 502 })
  }
}
