import { NextRequest, NextResponse } from 'next/server'

// In-app password gate. Protects EVERY route on EVERY domain (including the open
// Vercel production URL), so staff reach the site with one shared password and no
// paid plan. Fails CLOSED: if BCC_ACCESS_TOKEN is unset, nothing is served.
//
// Next 16 renamed Middleware to Proxy, so this file is `proxy.ts` and the export
// is `proxy`. Same file position, same matcher, same behaviour — the rename is
// the ONLY change here; the fail-closed logic below is untouched.
//
// Exempt paths: the login screen, the login API, and the /api/revalidate webhook
// (that one is already secret-gated and must stay reachable by WordPress).
// `/api/icd-reporter` is exempt for the same reason as `/api/revalidate`: it is
// called by a machine that has no cookie and never will — IC Developer asking
// whether error reporting is installed here. Gated, it answered 401, which is
// not "no reporter" but "we couldn't tell", and the two must not look alike.
// It gives away nothing but its own presence, and its self-test is key-gated.
const EXEMPT = ['/login', '/api/login', '/api/revalidate', '/api/icd-reporter']

const COOKIE = 'bcc_auth'

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Never gate Next internals or static asset files (CSS/images/fonts).
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/oxygen-css') ||
    pathname === '/favicon.ico' ||
    /\.[^/]+$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  if (EXEMPT.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = process.env.BCC_ACCESS_TOKEN || ''
  const authed = !!token && req.cookies.get(COOKIE)?.value === token
  if (authed) return NextResponse.next()

  // API calls get a clean 401; page requests go to the login screen.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
  return NextResponse.redirect(url)
}

// Match the index route explicitly (the negative-lookahead pattern alone skips '/'),
// plus everything else; in-code checks above skip internals/assets.
export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
