import type { Instrumentation } from "next";

import { onRequestError as report } from "./error-reporter.mjs";

/**
 * Report this app's server crashes to IC Developer (§51).
 *
 * Next calls `onRequestError` for every error thrown while serving a request —
 * a page render, a route handler, a server action. Uptime monitoring cannot see
 * any of these, because the app stays up the whole time: it answers, it just
 * answers with a 500 to one person, who then goes away and tells nobody.
 *
 * Needs two environment variables in Vercel, on Production AND Preview:
 *   ICD_APP_NAME   this app's name exactly as IC Developer lists it
 *   ICD_ERRORS_KEY the shared key
 * Without them it does nothing at all, quietly — a developer running this
 * locally should never see failures from a missing key.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  errorRequest,
  errorContext,
) => {
  await report(error, errorRequest, errorContext);
};

/** Required export. Nothing to start up — the reporter is stateless. */
export function register() {}
