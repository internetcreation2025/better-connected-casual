/**
 * Types for the drop-in reporter (§51).
 *
 * `error-reporter.mjs` is deliberately plain JavaScript so the identical file
 * works in any of our apps whatever their setup — but our apps have different
 * TypeScript settings, and one without `allowJs` refuses to import it at all.
 * This sits beside it so neither `@ts-ignore` nor a tsconfig change is needed
 * anywhere. Copy BOTH files into an app, always together.
 */

/** Next's `InstrumentationOnRequestError`, kept loose so it fits every version. */
export function onRequestError(
  error: unknown,
  errorRequest: Readonly<{ path?: string; method?: string; headers?: unknown }>,
  errorContext: Readonly<{ routePath?: string; routeType?: string; routerKind?: string }>,
): Promise<void>;

/** Health + self-test route handler. */
export function GET(request: Request): Promise<Response>;
