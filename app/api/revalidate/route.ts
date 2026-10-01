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
  // Next 16 requires a second argument saying how long stale content may still
  // be served. `{ expire: 0 }` means none at all — the next request is a cache
  // miss that waits for fresh WordPress content, which is what "instant
  // live-sync" means and is exactly what the old single-argument call did.
  //
  // NOT `'max'` (Next's general recommendation): that serves up to a year of
  // stale content while refreshing behind the scenes, so an editor would save a
  // page and still be shown the old one. NOT `updateTag`, which reads better
  // here but can only be called from a Server Action — this is a webhook.
  revalidateTag('bcc', { expire: 0 })
  return Response.json({ revalidated: true })
}
