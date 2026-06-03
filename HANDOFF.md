# Better Connected — Casual mirror · Handoff

A public-style **Next.js mirror** of the login-gated "Better Connected" WordPress staff
portal (betterconnected.me). It reproduces the site's display content faithfully (keeping
Oxygen's classes/IDs and CSS), excludes sensitive/interactive bits, rebuilds the JS-driven
parts natively, and is gated behind a single staff password. Read-only against WordPress
except small, removable helper endpoints.

- **Repo:** github.com/internetcreation2025/better-connected-casual
- **Host:** Vercel project `internet-creations-projects/better-connected-casual` (auto-deploys `main`)
- **Live (staff) URL:** https://casual.betterconnected.me  (password-gated)
- **Source WordPress:** https://betterconnected.me  (via the `novamira-betterconnected` MCP / Application Password)
- **Full spec & site inventory:** `docs/project_specs.md`, `docs/inventory.md`

## Set up on a new device
```bash
# 1. Clone
git clone https://github.com/internetcreation2025/better-connected-casual.git
cd better-connected-casual
npm install

# 2. Secrets — copy .env.local.example to .env.local and fill in the real values
#    (provided separately — never commit them). Needed for local dev/build.
cp .env.local.example .env.local   # then edit

# 3. Add the WordPress MCP server to Claude Code (so the AI can read/run WP abilities).
#    Use the real Application Password (provided separately):
claude mcp add 'novamira-betterconnected' \
  --env WP_API_URL='https://betterconnected.me/wp-json/mcp/novamira' \
  --env WP_API_USERNAME='icreation' \
  --env WP_API_PASSWORD='<APPLICATION PASSWORD>' \
  -- npx -y @automattic/mcp-wordpress-remote@latest
# Restart Claude Code so the MCP tools load.

npm run build   # verify
```

## Environment variables
Local: `.env.local`. Production: set in the Vercel project's **Settings → Environment Variables**
(already configured there). Names:
- `WP_SITE_URL` — `https://betterconnected.me`
- `WP_API_USERNAME` / `WP_API_PASSWORD` — the Application Password (read WP REST + helpers)
- `BCC_PREVIEW_ENABLED=1` — must be `1` or the catch-all route serves 503 (fail-closed)
- `BCC_ACCESS_PASSWORD` — the staff login password
- `BCC_ACCESS_TOKEN` — random value set as the auth cookie after a correct password
- `BCC_REVALIDATE_SECRET` — shared secret for the live-sync webhook

## WordPress side (already installed; source in `wordpress/`)
Small helpers the mirror calls. **render/data/bridge** all live in `wp-content/novamira-sandbox/`
(written via the Novamira MCP, which only permits PHP in the sandbox); the pinger is an mu-plugin.
They're already on the live site.
- `bcc-render.php` — returns a page rendered as a *casual* user (sandbox; admin-gated; one-time nonce).
- `bcc-data.php` — read-only `/bcc/v1/directory` (WP users) + `/bcc/v1/documents` (main-directory).
- `bcc-bridge.php` — `/bcc/v1/form/{id}` (form schema) + `/bcc/v1/form-submit` (runs Forminator's engine;
  hardened test mode; captcha bypass for the internal tool). Lives in `wp-content/novamira-sandbox/`
  (NOT mu-plugins — the old `mu-plugins/bcc-forms.php` was removed; the MCP can only write PHP to the
  sandbox, and a fresh path also dodges the stale-OPcache gotcha). v3 fixes (2026-06-03):
  (1) captcha bypass now matches **all** providers' `siteverify` URLs incl. Cloudflare **Turnstile**
  (which form 53 uses); (2) forces `wp_doing_ajax` so Forminator's `wp_send_json_success()` routes
  through `wp_die()` (capturable) instead of bare `die()` under REST — without this, test-mode
  cleanup never ran and the raw JSON leaked.
- `bcc-revalidate.php` — mu-plugin that pings `/api/revalidate` on save for instant live-sync
  (paste the real `BCC_REVALIDATE_SECRET` into it).

## How it works (key files)
- `app/[[...slug]]/route.ts` — catch-all proxy: fetches the casual-rendered page via `bcc-render`,
  sanitizes it, then runs the injectors. Host-gated + `BCC_PREVIEW_ENABLED` (fail-closed). 5-min
  ISR cache tagged `bcc`.
- `lib/sanitize.mjs` — strips scripts/forms/login bits, decodes Cloudflare-obfuscated emails,
  removes hide-targets (A–Z, hero short-links, WPGB facets, notifications), rewrites URLs.
- `lib/grids.mjs` — native rebuilds: News / Staff directory / Document library grids + filters,
  home instant-search, header marquee, Splide/Kadence carousel → CSS scroller.
- `lib/forms.mjs` — native Forminator form rebuild from schema; `injectForms`. `ENABLED_FORMS` set
  controls which forms are live. Renders text/select/checkbox/upload (single + multi) /e-signature
  fields. Submits via `/api/forms/submit` → bridge; multi-file fields stage via `/api/forms/upload`.
- `app/api/forms/upload/route.ts` — same-origin proxy that relays one file to the bridge's
  `/bcc/v1/form-upload` (staged multi-file uploads).
- `middleware.ts` + `app/login/route.ts` + `app/api/login/route.ts` — staff password gate (cookie).
- `app/api/revalidate/route.ts` — live-sync webhook (purges the `bcc` cache tag).
- `app/api/search/route.ts` — same-origin search proxy.

## Current status
- ✅ Display: faithful Oxygen pages, emails revealed, A–Z directory filter, marquee, carousels.
- ✅ Auth gate, live-sync, `noindex`, served on `casual.betterconnected.me`.
- ✅ Forms (13/13): simple text, single + multi-file upload, captcha (contact), and e-signature.
- ✅ Contact form (id 53): submits through the bridge — Turnstile captcha bypass + REST `wp_die`
  capture fixed and verified in test mode (entry created, email blocked, entry auto-deleted) 2026-06-03.
- ✅ **Multi-file attachments** (portal-feedback 3888, quarterly-nom 37894, special-recognition 37896,
  newsletter 36355): each file is staged to `/bcc/v1/form-upload` (→ Forminator temp dir) as it's
  chosen, then the temp refs are submitted as the `forminator-multifile-hidden` JSON field (keys
  carry a `_<uid>` suffix that Forminator strips). Verified in test mode 2026-06-03.
- ✅ **E-signature** (friends-&-family 36425, active-staff-card 36386): hand-rolled canvas pad submits
  `field-{id}`=uniq + `ctlSignature{uniq}_data_canvas`=PNG data-URL; Forminator saves it. No bridge
  change. Verified in test mode 2026-06-03.

## Gotchas (learned the hard way)
- **OPcache:** the host serves a stale *compiled* copy of mu-plugins to public requests, and
  `opcache_reset()` from the MCP pool doesn't clear it. Workaround: change the helper's **filename**
  so it compiles fresh (that's why the bridge is `bcc-bridge.php`).
- **Vercel "Standard Protection" does NOT gate the bare `<project>.vercel.app`** production domain.
  The app gates itself via `middleware.ts` (fail-closed), which is why it's safe on any host.
- **Captcha** on the contact form is bypassed server-side (client-authorized) — justified because the
  mirror is staff-only/password-gated. The original site is untouched.
- **Test forms safely:** submit with a required field missing (validation fails → no entry/email), or
  use `bcc_test=1` (bridge blocks email + auto-deletes the entry). Real recipients are live staff inboxes.
