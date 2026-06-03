import { NextRequest } from 'next/server'

const SITE = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')
const USER = process.env.WP_API_USERNAME ?? ''
const PASS = process.env.WP_API_PASSWORD ?? ''
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

// Same host gate as the page proxy / submit route.
const SERVE_HOSTS = new Set([
  'casual.betterconnected.me',
  'better-connected-casual.vercel.app',
  'better-connected-casual-git-main-internet-creations-projects.vercel.app',
  'localhost:3000',
  'localhost:3100',
])

// Stages a single file for a multiple-file Forminator field. Relays it to the WP
// bridge, which puts it in Forminator's temp dir and returns a file_name the browser
// then submits as {element_id}[file][N][file_name] with the form.
export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || ''
  if (process.env.BCC_PREVIEW_ENABLED !== '1' || !SERVE_HOSTS.has(host)) {
    return Response.json({ success: false, message: 'Unavailable' }, { status: 503 })
  }

  try {
    const incoming = await req.formData()
    const fd = new FormData()
    for (const [k, v] of incoming.entries()) fd.append(k, v as string | Blob)

    const r = await fetch(`${SITE}/wp-json/bcc/v1/form-upload`, {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: fd,
    })
    const data = await r.json().catch(() => ({ success: false, message: 'Unexpected response from server.' }))
    return Response.json(data, { status: 200 })
  } catch {
    return Response.json({ success: false, message: 'Could not reach the upload service.' }, { status: 502 })
  }
}
