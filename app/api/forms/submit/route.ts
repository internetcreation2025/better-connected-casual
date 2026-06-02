import { NextRequest } from 'next/server'

const SITE = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')
const USER = process.env.WP_API_USERNAME ?? ''
const PASS = process.env.WP_API_PASSWORD ?? ''
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

// Same host gate as the page proxy (staff are already past the password gate here).
const SERVE_HOSTS = new Set([
  'casual.betterconnected.me',
  'better-connected-casual.vercel.app',
  'better-connected-casual-git-main-internet-creations-projects.vercel.app',
  'localhost:3000',
  'localhost:3100',
])

// Relays a mirror form submission to the WordPress bridge, which runs it through
// Forminator's real engine (validation + entry + email). Keeps the app password
// server-side; the browser only ever talks to this same-origin route.
export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || ''
  if (process.env.BCC_PREVIEW_ENABLED !== '1' || !SERVE_HOSTS.has(host)) {
    return Response.json({ success: false, data: 'Unavailable' }, { status: 503 })
  }

  try {
    const incoming = await req.formData()
    const fd = new FormData()
    for (const [k, v] of incoming.entries()) fd.append(k, v as string | Blob)

    const r = await fetch(`${SITE}/wp-json/bcc/v1/form-submit`, {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: fd,
    })
    const data = await r.json().catch(() => ({ success: false, data: 'Unexpected response from server.' }))
    return Response.json(data, { status: 200 })
  } catch {
    return Response.json({ success: false, data: 'Could not reach the submission service.' }, { status: 502 })
  }
}
