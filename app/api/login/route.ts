import { NextRequest } from 'next/server'

// Verifies the shared staff password and, on success, sets the auth cookie that
// the middleware checks. Password and cookie value live only in env vars.
export async function POST(req: NextRequest) {
  const password = process.env.BCC_ACCESS_PASSWORD || ''
  const token = process.env.BCC_ACCESS_TOKEN || ''

  let given = ''
  let next = '/'
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    given = String(body.password || '')
    next = String(body.next || '/')
  } else {
    const form = await req.formData()
    given = String(form.get('password') || '')
    next = String(form.get('next') || '/')
  }

  // Wrong / unconfigured password → back to the login screen with an error.
  if (!password || !token || given !== password) {
    const q = next && next !== '/' ? `&next=${encodeURIComponent(next)}` : ''
    return new Response(null, { status: 303, headers: { Location: `/login/?error=1${q}` } })
  }

  // Success → set the auth cookie and send the user to their destination.
  // Only allow same-site relative redirects.
  const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return new Response(null, {
    status: 303,
    headers: {
      Location: dest,
      'Set-Cookie': `bcc_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    },
  })
}
