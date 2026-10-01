import { GET as reporterGet } from "../../../error-reporter.mjs";

export const dynamic = "force-dynamic";

/**
 * Lets IC Developer confirm this app's error reporter is installed and running
 * (§51), rather than reading silence as good news — a collector that quietly
 * dies looks exactly like an app with no errors.
 *
 * `?selftest=<ICD_ERRORS_KEY>` makes it throw on purpose, which is how the
 * chain gets proved instead of assumed. Without the key it is a 404.
 */
export async function GET(request: Request): Promise<Response> {
  return reporterGet(request);
}
