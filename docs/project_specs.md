# Project Spec — Better Connected (Casual) Public Mirror

_Last updated: 2026-06-02 · Status: **APPROVED** (2026-06-02) — building_

## 1. What this app does & who uses it
A standalone **Next.js website that faithfully reproduces the *display* content** of the existing
"Better Connected" WordPress staff portal (betterconnected.me), keeping the original look and feel.

- **Source of truth:** the WordPress site (stays exactly as-is; we only read from it).
- **Audience:** company **staff**, viewed within staff areas. **Not** intended for the general public.
- **No login** on the new site, and **no interactive features** — it is read-only display content.
- **Live:** when content changes in WordPress, the new site updates automatically.

## 2. Hard rules (privacy & safety)
- **Never publish sensitive/personal data** to a public address. We **exclude** staff directories with
  personal data, performance reviews (PDR), profiles, nominations, account areas, and all forms/workflows.
- **Build-then-strip happens in a *protected preview*** (Vercel password-protected), not the live URL.
  Only the stripped, reviewed version is promoted to the live address.
- Live site is set to **`noindex`** (kept out of search engines).
- WordPress stays **read-only except ONE** small, removable render helper in the sandbox folder
  (client-approved 2026-06-02): admin-gated via Application Password, **no public bypass token**
  (internal render uses a one-time 30-second nonce), **SSL verification on**, limited to the in-scope
  post types, and **deletable anytime** via the connection. No other writes to WordPress.

## 3. Tech stack
- **Framework:** Next.js (App Router) + TypeScript
- **Markup & styling (faithful):** **Retain all original Oxygen CSS classes and element IDs** in the
  output HTML, and **reuse Oxygen's generated CSS** so the design matches 1:1 and stays easy to tweak
  later via the same selectors. Tailwind only for any new wrapper/chrome we add ourselves.
- **Content source:** content + **fully-rendered Oxygen HTML pulled server-side via the
  `novamira-betterconnected` MCP** (render the Oxygen output for each item + read the cached Oxygen CSS).
  Rendering on the WP server retains all Oxygen markup **and** cleanly bypasses the login wall — note:
  front-end pages otherwise redirect to `/log-in/`, and an application password only authenticates REST
  requests, not normal page views, so we render on the server rather than scraping the front end.
- **Live sync:** Incremental Static Regeneration (ISR) + on-demand revalidation triggered by a WordPress
  "content changed" webhook (fallback: timed revalidation)
- **Images:** served from WordPress media via `next/image` (already optimised by Smush Pro), with the option
  to mirror to Vercel later
- **Hosting:** Vercel — project `internet-creations-projects/better-connected-casual` (already set up)
- **Repo:** `github.com/internetcreation2025/better-connected-casual` (currently empty starter)

## 4. Content to INCLUDE (display) — initial build
| Section | Source (WP) | Approx count |
|---|---|---|
| News | `post` | 96 |
| Events / Learning & Development | `learning-development` | 139 |
| Q&As | `q-a` | 7 |
| Projects | `bc_project` | 6 |
| People directory (KEY) | **WP Users** + profile fields | 426 |
| Document library ("Main directory") | `main-directory` CPT | ~77 |
| Awards & winners | `annual-winner` / `quarterly-winner` / `ceo-spotlight-winner` / `special-recognition` | ~4 |
| Info / landing pages | selected `page`s | ~12 |
| Supporting taxonomies (filters/categories) | categories, training-group, letters, etc. | — |
| Media (images) | `attachment` | ~1,190 |

Landing/info pages in scope: Home, Wellbeing Hub, Wellbeing Champions, Learning & Development,
Events Calendar, Support, Top Company Perks, Q&As/Recent Questions, Sitemap, Privacy Policy.

## 5. Content to EXCLUDE (sensitive or non-display)
- All **forms** (Gravity Forms / Forminator): PDR review, nominations, surveys, Safety Pulse, incident
  reports, feedback, applications, agreements, etc.
- **PDR / performance reviews** and all Gravity Flow **workflow** pages (Inbox / Status / Submit).
- **Member/account** pages: Log In, Register, Register Casual, Account, Profile, Password Reset, memberships.
- _(Awards/winners — annual/quarterly/CEO/special recognition — are **INCLUDED** per client; see §4.)_
- _(People directory = **WP Users (426)** — INCLUDED & KEY. Personal data → live site must be
  **gated to staff**, never on an open public URL. The `main-directory` CPT (document library, ~77) is
  also INCLUDED. See §4.)_

### Casual-user exclusions (confirmed by client 2026-06-02)
- **Directors' Directory** — the entire `directors-directory` post type (8 posts) and its page. Excluded.
- **Home page** — remove the **"Our People Forum"** block, and hide the **five "short link" icons**
  (`#div_block-5979-2`) under the hero search bar.
- **"Our People Forum" page** (id 36738) — **skipped** (not built) for now.
- **A–Z index** (`#section-821-2`, `<ul class="directory-letter-list">`) — hide on the home page
  **and everywhere it appears** (site-wide component).
- **PDR** — all PDR functionality excluded (forms + Gravity Flow workflow), as above.

_These are component-level removals. Because we retain Oxygen classes/IDs, each is stripped by its Oxygen
selector — I'll identify and confirm the exact selector for each element before removing it._

### Authoritative casual-access map (from WPUM Content Restriction, 2026-06-02)
The site enforces a **whole-site login wall**, and `casual` is in the global allow-set — so a casual user,
once logged in, can reach everything **except** a few individually-restricted items. We mirror that
**casual-after-login view**. Almost nothing is restricted: News, Events, Q&As, Projects and the
Directors-Directory CPT entries carry **no** individual restriction; only these are gated from casual:

- **Director's Directory** page — restricted to director/admin (also `restrict_everywhere`). Excluded (matches client rule). _Note: the 8 `directors-directory` CPT entries aren't individually flagged in WPUM CR, but the listing page is director-only, so casual never reaches them — we exclude the whole CPT per client intent._
- **"Newsletter Archives & Submissions"** (`main-directory` entry, director-only) — exclude from the staff directory (so staff directory = 77, not 78).
- **10 manager-only media files** (payroll/HR forms: payroll handbook, termination form, etc.) — exclude from the media mirror.
- **Log In / Register** — logged-out-only pages; already excluded as account/auth.

No content is restricted to specific *users* (all rules are role-based). The three design-section hides
above (Our People Forum, hero short-links, A–Z) are **not** represented in WPUM CR — confirmed they're
pure front-end sections we strip manually.

## 6. Data models (to map into Next.js)
Post types: `post`, `learning-development`, `q-a`, `bc_project`, selected `page`s.
Taxonomies in play: `category`, `champion`, `letter`, `training-group`, `main-directory-category`.
ACF Pro field groups attached to these types will be inventoried in Build Step 1 and mapped to templates.

## 7. Build plan (phased)
1. **Inventory & design tokens** — pull ACF field groups per type, the Oxygen design tokens
   (fonts, colours, spacing), menus, and 2–3 representative rendered pages for visual reference.
2. **Foundation** — scaffold Next.js in the repo, Tailwind theme matching the design tokens, base layout/nav/footer.
3. **Structured content templates** — list + detail templates for News, Events, Q&As, Projects (live data, ISR).
4. **Landing pages** — rebuild Home + Wellbeing Hub etc. faithfully by hand.
5. **Live sync** — wire WordPress → Next.js revalidation webhook.
6. **Strip & review** — confirm exclusions, run on protected preview, get your sign-off.
7. **Go live** — promote the stripped build to the live address (noindex).

## 8. Definition of "done" (initial task)
- Next.js app deployed to Vercel (protected preview) that **faithfully displays** the in-scope content,
  pulling **live** from WordPress, with design true to the original.
- All excluded/sensitive content confirmed absent.
- Content edits in WordPress appear on the new site automatically.
- Build passes (`npm run build`), no console errors, happy + empty/error states checked.

## 9. Decisions (resolved 2026-06-02)
1. **Staff directory:** INCLUDED (key content). **Directors' Directory** excluded.
2. **Awards/winners:** INCLUDED (names shown).
3. **Domain:** use the **Vercel URL** for now (no custom domain yet).
4. **Search engines:** **`noindex`** — site hidden from search.
5. **Build-in-protected-preview:** approved (sensitive data never on an open URL).
