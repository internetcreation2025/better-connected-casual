import { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'

// Instant live-sync webhook. WordPress pings this on every save (post, page, user,
// document). We purge the shared 'bcc' data-cache tag so the next page load pulls
// fresh content from WordPress immediately, instead of waiting out the 5-min cache.
//
// Auth: a shared secret in BCC_REVALIDATE_SECRET, sent as ?secret= or x-bcc-secret.
// Without it, anyone could spam cache purges, so it is required.
export async function POST(req: NextRequest) {
  const secret = process.env.BCC_REVALIDATE_SECRET || ''
  const given = req.nextUrl.searchParams.get('secret') || req.headers.get('x-bcc-secret') || ''
  if (!secret || given !== secret) {
    return Response.json({ revalidated: false, error: 'bad secret' }, { status: 401 })
  }
  revalidateTag('bcc')
  return Response.json({ revalidated: true })
}
