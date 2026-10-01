/**
 * IC Developer error reporter — drop this file into any of our Next.js apps.
 *
 * Dependency-free and importable from a .ts, .js or .mjs file, exactly like
 * `security-headers.mjs`. Two things go in the app:
 *
 *   1. instrumentation.ts at the project root:
 *
 *        export { onRequestError } from "./error-reporter.mjs";
 *        export function register() {}
 *
 *   2. app/api/icd-reporter/route.ts, so IC Developer can confirm this is
 *      actually installed and running:
 *
 *        export { GET } from "../../../error-reporter.mjs";
 *        export const dynamic = "force-dynamic";
 *
 *      That same route carries the SELF-TEST (see `GET` below), so the whole
 *      chain can be proved on any app at any time rather than hoped about.
 *
 * Then two environment variables in Vercel (Production AND Preview, or you
 * can't test it on a preview — a trap that cost a day on §41):
 *
 *   ICD_APP_NAME   the app's name exactly as it appears in IC Developer
 *   ICD_ERRORS_KEY the shared key
 *
 * WHY THIS EXISTS RATHER THAN SENTRY
 * Server errors arrive readable, so the hard part of an error service —
 * un-minifying browser stack traces — buys us little. This sends the same
 * `onRequestError` payload Sentry's server integration uses, to our own
 * dashboard, so no customer data reaches a third party and no browser is
 * involved (which means no Content-Security-Policy change in the app).
 */

const ENDPOINT =
  process.env.ICD_ERRORS_ENDPOINT || "https://developer.internetcreation.net/api/errors";

/** Deploys are identified by the commit, which Vercel injects for us. */
function release() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Next.js calls this on every server-side error (App Router and Pages Router,
 * renders, route handlers and server actions). Signature is Next's own
 * `InstrumentationOnRequestError`.
 */
export async function onRequestError(error, errorRequest, errorContext) {
  try {
    const appName = process.env.ICD_APP_NAME;
    const key = process.env.ICD_ERRORS_KEY;
    // Not configured is not an error worth making noise about — a developer
    // running this locally shouldn't see failures from a missing key.
    if (!appName || !key) return;

    const err = error instanceof Error ? error : new Error(String(error));

    const body = {
      app: appName,
      name: err.name || "Error",
      message: (err.message || "").slice(0, 4000),
      stack: (err.stack || "").slice(0, 20000),
      // The ROUTE, never the full URL. A URL carries ids, tokens and search
      // terms; the route is what you need to find the bug and nothing more.
      routePath: errorContext?.routePath ?? errorRequest?.path ?? null,
      routeKind: errorContext?.routeType ?? null,
      method: errorRequest?.method ?? null,
      release: release(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      occurredAt: new Date().toISOString(),
    };

    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-icd-error-key": key },
      body: JSON.stringify(body),
      // Never let reporting an error become a second, slower problem. If the
      // collector is down, the app carries on; the collector's own absence is
      // detected by IC Developer polling the route below, not by this throwing.
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Swallowed on purpose. An error reporter that can itself throw inside an
    // error handler turns one broken request into a broken server.
  }
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Written out by hand rather than importing `node:crypto`, so this file stays
 * importable from an edge-runtime route as well as a Node one — the whole
 * reason it has no imports at all.
 */
function secretsMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Health endpoint IC Developer polls to confirm the reporter is installed.
 *
 * This is the answer to "who watches the watchman". A collector that quietly
 * dies looks exactly like an app with no errors, and silence would otherwise
 * read as good news. IC Developer ASKS rather than waiting to be told, so a
 * low-traffic app that legitimately has nothing to report is never confused
 * with one whose reporting has broken.
 *
 * Deliberately exposes nothing but its own presence and version — no key, no
 * app name, no environment detail.
 *
 * SELF-TEST: `?selftest=<ICD_ERRORS_KEY>` makes this route throw on purpose,
 * which is the ONLY way to prove the chain end to end — Next's
 * `onRequestError` firing, the report arriving, the group forming, the page
 * showing it. Installing a reporter and assuming it works is how you find out
 * it doesn't on the day it matters. It is gated on the shared key (so a
 * stranger can't make an app throw), answers 404 to anyone without it so its
 * existence isn't advertised, and reports as `IcdReporterSelfTest`, which is
 * recognisable in the Errors list and safe to resolve.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const selftest = url.searchParams.get("selftest");
  if (selftest) {
    if (!secretsMatch(selftest, process.env.ICD_ERRORS_KEY ?? "")) {
      return new Response("Not found", { status: 404 });
    }
    const err = new Error("Deliberate error from the IC Developer reporter self-test.");
    err.name = "IcdReporterSelfTest";
    throw err;
  }

  return new Response(
    JSON.stringify({ ok: true, reporter: "icd", version: 1, release: release() }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
