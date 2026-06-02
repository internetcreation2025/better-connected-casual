// Server-side WordPress data helper.
// Credentials are read from env and used ONLY on the server. Never import this
// into a client component.

const WP_SITE_URL = (process.env.WP_SITE_URL ?? 'https://betterconnected.me').replace(/\/$/, '')
const WP_USER = process.env.WP_API_USERNAME ?? ''
const WP_APP_PASSWORD = process.env.WP_API_PASSWORD ?? ''

function authHeader(): Record<string, string> {
  if (!WP_USER || !WP_APP_PASSWORD) return {}
  const token = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64')
  return { Authorization: `Basic ${token}` }
}

/**
 * Fetch JSON from the WordPress REST API.
 * `path` may be a full URL or a path relative to /wp-json/ (e.g. "wp/v2/posts").
 * Uses ISR: responses revalidate every 5 minutes by default.
 */
export async function wpFetch<T>(path: string, init?: RequestInit & { revalidate?: number }): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${WP_SITE_URL}/wp-json/${path.replace(/^\//, '')}`

  const { revalidate = 300, ...rest } = init ?? {}
  const res = await fetch(url, {
    ...rest,
    headers: { ...authHeader(), ...(rest.headers ?? {}) },
    next: { revalidate },
  })

  if (!res.ok) {
    throw new Error(`WP fetch failed: ${url} -> ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export { WP_SITE_URL }
