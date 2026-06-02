import { NextRequest, NextResponse } from 'next/server'

// In-app password gate. Protects EVERY route on EVERY domain (including the open
// Vercel production URL), so staff reach the site with one shared password and no
// paid plan. Fails CLOSED: if BCC_ACCESS_TOKEN is unset, nothing is served.
//
// Exempt paths: the login screen, the login API, and the /api/revalidate webhook
// (that one is already secret-gated and must stay reachable by WordPress).
const EXEMPT = ['/login', '/api/login', '/api/revalidate']

const COOKIE = 'bcc_auth'

export function middleware(req: NextRequest) {
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
