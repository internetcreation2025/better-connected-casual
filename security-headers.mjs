/**
 * §41 — the shared security response headers for our own Next.js apps.
 *
 * §38 measured all 14 apps and found the browser protections were the weakest
 * part of the estate: Content-Security-Policy missing everywhere, and MIME,
 * clickjacking, referrer and permissions policies missing on ten of fourteen.
 * None of that is exotic work — it's the same handful of headers each time,
 * which is exactly why it should be one file rather than fourteen opinions.
 *
 * Deliberately dependency-free, plain `.mjs`, and importable from a
 * `next.config.ts`, `.mjs` or `.js` alike, so it can be dropped into any of our
 * apps unchanged. The only thing an app should need to say is what IT talks to
 * — see `securityHeaders({ connect, img, frame })`.
 *
 * Usage:
 *   import { securityHeaders } from "./security-headers.mjs";
 *
 *   const nextConfig = {
 *     poweredByHeader: false,            // <- the sixth fix; not a header we add
 *     async headers() {
 *       return [{ source: "/:path*", headers: securityHeaders({
 *         connect: [process.env.NEXT_PUBLIC_SUPABASE_URL],
 *       }) }];
 *     },
 *   };
 *
 * NOT included on purpose: Strict-Transport-Security. Vercel already sends it
 * on custom domains and all 14 apps pass that check — setting it here as well
 * would emit the header twice for no gain.
 */

/** Turn a full origin into something usable in a CSP source list. */
function origin(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    // Already a bare host or a wildcard like https://*.supabase.co — pass it on.
    return String(value).trim() || null;
  }
}

/**
 * The WebSocket form of an origin, for the one case that genuinely needs it.
 *
 * Supabase's client opens a realtime socket to the same host it uses for REST,
 * and forgetting it breaks live updates in a way that looks like "the page just
 * doesn't refresh" rather than an error. Every OTHER origin gets no wss entry:
 * deriving one for, say, Google Analytics widened the policy to a connection
 * that will never be made, and a permission nobody needs is still a permission.
 *
 * Need a socket elsewhere? Pass the `wss://…` origin in `connect` yourself.
 */
function asWebsocket(value) {
  const o = origin(value);
  if (!o || !o.startsWith("https://")) return null;
  const host = o.slice("https://".length);
  return /(^|\.)supabase\.(co|in|net)$/i.test(host) ? `wss://${host}` : null;
}

const uniq = (list) => [...new Set(list.filter(Boolean))];

/**
 * Build the Content-Security-Policy.
 *
 * Two honest compromises, both worth stating rather than hiding:
 *
 *   `script-src 'unsafe-inline'` — Next.js inlines its own bootstrap script on
 *   every page. Removing this needs a per-request nonce threaded through
 *   middleware, which is a real change to how an app renders; it is NOT a
 *   copy-paste fix, so it isn't pretended to be one here.
 *
 *   `style-src 'unsafe-inline'` — React writes inline style attributes and
 *   Tailwind injects a style tag. Same story.
 *
 * What this policy still buys, even with those two: `frame-ancestors` stops the
 * app being embedded, `object-src 'none'` kills plugin-based injection,
 * `base-uri 'self'` stops a `<base>` tag redirecting every relative URL, and
 * `form-action 'self'` stops a posted form being aimed at someone else's
 * server. Those are the holes people actually walk through.
 */
export function contentSecurityPolicy({
  connect = [],
  img = [],
  frame = [],
  script = [],
  style = [],
  font = [],
  selfFrame = false,
  preview = isPreview(),
} = {}) {
  // Vercel injects its comment/feedback toolbar into PREVIEW deployments only.
  // Without these it's blocked and reviewers lose the toolbar — but there is no
  // reason to widen PRODUCTION for a script that never loads there, so this is
  // switched on by VERCEL_ENV rather than added unconditionally.
  const toolbarScript = preview ? ["https://vercel.live"] : [];
  const toolbarConnect = preview ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : [];
  const toolbarImg = preview ? ["https://vercel.live", "https://vercel.com"] : [];
  const toolbarFont = preview ? ["https://vercel.live", "https://assets.vercel.com"] : [];

  const connectSrc = uniq([
    "'self'",
    ...connect.flatMap((c) => [origin(c), asWebsocket(c)]),
    ...toolbarConnect,
  ]);
  const imgSrc = uniq(["'self'", "data:", "blob:", ...img.map(origin), ...toolbarImg]);
  const frameSrc = uniq(["'self'", ...frame.map(origin), ...toolbarScript]);
  const scriptSrc = uniq(["'self'", "'unsafe-inline'", ...script.map(origin), ...toolbarScript]);
  const styleSrc = uniq(["'self'", "'unsafe-inline'", ...style.map(origin), ...toolbarScript]);
  const fontSrc = uniq(["'self'", "data:", ...font.map(origin), ...toolbarFont]);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${selfFrame ? "'self'" : "'none'"}`,
    "form-action 'self'",
    `img-src ${imgSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `script-src ${scriptSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    // A service worker (web push) and anything using a blob worker.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/** True on a Vercel preview deploy. Locally VERCEL_ENV is unset — treat as not preview. */
function isPreview() {
  const env = process.env.VERCEL_ENV;
  return Boolean(env) && env !== "production";
}

/**
 * The full set, ready to return from `headers()`.
 *
 * @param {{ connect?: string[], img?: string[], frame?: string[], script?: string[],
 *           style?: string[], font?: string[], selfFrame?: boolean, csp?: boolean }} [options]
 *   `connect` — every origin the browser talks to (Supabase, Sentry, analytics).
 *   `img`     — extra image sources beyond self/data/blob. `"https:"` allows any
 *               https host, which is the honest answer for a white-labelled app
 *               that renders customer-supplied logos.
 *   `script`  — third-party scripts (analytics, Turnstile, a payment SDK).
 *   `style`   — external stylesheets, e.g. Google Fonts' CSS.
 *   `font`    — external font files, e.g. fonts.gstatic.com.
 *   `frame`   — anything the app legitimately embeds (Turnstile, a payment iframe).
 *   `selfFrame` — true when the app embeds ITS OWN pages (an admin preview, a
 *               document viewer): SAMEORIGIN and frame-ancestors 'self' rather
 *               than denying outright.
 *   `csp`     — set false to ship the four simple headers first and add the
 *               policy separately.
 *
 * Get these from what the app ACTUALLY loads, not from what you assume: open it
 * and record the origins. Guessing produces a policy that breaks a page nobody
 * visited during review.
 */
export function securityHeaders(options = {}) {
  const { csp = true, ...cspOptions } = options;
  const { selfFrame = false } = options;
  const headers = [
    // Don't let the browser second-guess a file's type and run it.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Nothing of ours is meant to be embedded in someone ELSE'S page. An app
    // that embeds ITSELF (a preview pane, an embedded form) passes
    // `selfFrame: true` and gets SAMEORIGIN instead — don't tighten an app to
    // DENY without checking, because the breakage is invisible until someone
    // opens the page that does the embedding.
    { key: "X-Frame-Options", value: selfFrame ? "SAMEORIGIN" : "DENY" },
    // Send the origin cross-site, never the full URL — paths carry ids and tokens.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Switch off the device features none of these apps use.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
    },
  ];
  if (csp) {
    headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(cspOptions) });
  }
  return headers;
}
