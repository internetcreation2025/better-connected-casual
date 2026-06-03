# betterconnected.me — Content & Design Inventory

Read-only investigation via MCP (`novamira/execute-php`). Site: **Better Connected** (intranet, login-walled). Builder: **Oxygen**. Server path root: `/home/betterco/public_html/`. Public URL base: `https://betterconnected.me`.

> Note: the front-page builder meta read (`get_post_meta(2,'ct_builder_shortcodes')`) was intermittently returning empty. Reliable reads were done directly against `wp_postmeta.meta_id = 229` (key `_ct_builder_shortcodes`, 108,847 chars). The underscore-prefixed key is the real one.

---

## 1. ACF Field Map (per in-scope post type)

ACF is active. Groups attached to in-scope types:

### `post` (News)
- **Notifications** (`group_685bf0ff99210`)
  - `add_to_notifications` — "Add to notifications icon on head of website" — `true_false`
- Also: **Send Notification Email** (`group_68bf0daecbefa`) and **Top image** (`group_62854b6dd834f`, applies to posts + non-home pages) — admin/email tooling, plus a top hero image.

### `learning-development` (Events)
- **Learning and development calendar / Events** (`group_68553fd137bf5`)
  - `start_datetime` — Start Date/Time — `date_time_picker`
  - `end_datetime` — End Date/Time — `date_time_picker`
  - `venue` — `text`
  - `facilitator` — `text`
  - `online_event` — `true_false`
  - `meeting_link` — `url`
  - `capacity` — `number`
  - `attendee_list` — `repeater` → sub: `invited_by` (user), `invitee` (user), `date_invited` (date_picker), `approved_by` (user), `approved_to_attend` (true_false), `date_of_approval` (date_picker), `line_manager` (user)
- Also: **Notifications**.

### `q-a` (Q&As)
- **QandA** (`group_68496dd78bd4e`)
  - `director` — "Answered by" — `text`
  - `director_answer` — "Director answer" — `wysiwyg`

### `bc_project` (Projects)
- **No ACF group.** Uses core fields only: `post_title`, `post_content`, featured image (`_thumbnail_id`). Taxonomy `bcph_status` (Live/Completed/Archived) carries the state.

### `main-directory` (document/resource directory — NOT people)
- **Main directory post** (`group_684a7b8cc2b5a`; location = post_type main-directory AND post != 36049)
  - `main_directory_post_links` — `repeater` → sub: `link_title` (text), `external_link` (url), `internal_link_or_media_file` (url), `internal_link_or_media_file_new` (file)
  - `viewing_permissions` — `radio` — choices: `All Subscribers Can View`, `Managers Only`, `HR Only`, `Managers and HR Only`
- **Main Directory (Video Library)** (`group_6889ec9fec7d7`) applies only to post id 36049.
- Also: **Notifications**.
- (Note: the per-type lookup `acf_get_field_groups(['post_type'=>...])` missed this group because its location rule has an extra AND clause — found via full group enumeration.)

### `annual-winner`
- **Annual Winners** (`group_69981784be955`)
  - `winners` — `repeater` → sub: `select_winner` (user), `select_winner_image` (image), `year` (text)

### `quarterly-winner`
- **Quarterly Winners** (`group_6997322f9019f`) — flat fields per region/award, each a `user` + paired `image`:
  - `coastal_quarterly_winner`(+_image), `central_quarterly_winner`(+_image), `east_quarterly_winner`(+_image), `west_quarterly_winner`(+_image), `corporate_services_winner`(+_image), `customer_choice_award`(+_image)

### `ceo-spotlight-winner`
- **CEO Spotlight Winners** (`group_69981270d000a`)
  - `winners` — `repeater` → sub: `select_winner` (user), `select_winner_image` (image)

### `special-recognition`
- **Special Recognition Winners** (`group_6998393a06367`) — five `group` fields, each identical sub-shape:
  - `ceo_special_recognition_award`, `young_person_of_the_year`, `casual_of_the_year`, `aspiring_leader_award`, `volunteer_award`
  - each group sub: `winning_employee` (user), `image` (image), `quote` (wysiwyg), `description` (wysiwyg)

### Front page (`page` id 2)
- **Home page** (`group_6597e8ac87350`) and **Notifications**. (Display content is in the Oxygen builder, see §7.)

### Staff people directory (WP Users, not a post type)
- **User fields** (`group_6849b546d73f0`, location user_form = all) — this is the real staff directory data:
  - `user_links` — repeater (`link_title` text, `link_url` url)
  - `user_location` — taxonomy
  - `user_job_title` — taxonomy
  - `champion_status` — taxonomy
  - `user_first_letter_of_first_name` — taxonomy
  - `Work_Mobile_Number` — text
- 426 users total. Roles: subscriber 394, manager 79, director 26, casual 26, hr 13, administrator 12, plus reviewer/senior_reviewer/developer/burst_viewer.

### Other ACF groups (page-specific, out of primary scope but present)
Annual Awards (pg 37615), Email Toolkit (pg 36753), Employee recognition (pg 3431), Global Settings (options page), Cluster winners (cluster-winner), Directors Directory Posts, Staff directory (staff-directory CPT), Staff newsletters (pg 36389), Top company perks (pg 3626), Raffle Page (pg 37428), Send Notification Email, Training & Development (pg 3723), Wellbeing Champions (pg 37444), Wellbeing Hub (pg 3698).

---

## 2. Real Sample per Type

| Type | ID | Title | Populated ACF (preview) |
|---|---|---|---|
| post | 38347 | Commercial Advertising Brochure | `add_to_notifications: true` |
| learning-development | 38029 | Getting the most from your PDR conversation / Managers' Guidance 2026 (op1) | start `April 17, 2026 10:00 am`, end `10:40 am`, venue `MS Teams`, facilitator `Our People Team`, online_event `true`, meeting_link Teams URL, capacity `50`, attendee_list `[3 rows]` |
| q-a | 36682 | How do you see the future of the health, sport and leisure industry evolving…? | director `Jeph Hamilton, Chair of the Board`, director_answer (wysiwyg HTML) |
| bc_project | 38212 | Michael Woods Gym Investment | none (only featured image 38213; content empty) |
| main-directory | 38356 | Microsoft Teams Backgrounds | `main_directory_post_links` = 6 rows (each link_title + media file URL under /uploads/), `viewing_permissions: All Subscribers Can View` |
| annual-winner | 37864 | 2026 | `winners` = 5 rows (user + image + year) |
| quarterly-winner | 38085 | Q4 2026 | coastal/central/east/west/corporate winners each set (user array + image id); customer_choice_award empty |
| ceo-spotlight-winner | 37857 | 2026 | `winners` = 7 rows |
| special-recognition | 38084 | 2026 | all 5 award groups populated (4 sub-fields each) |

Published counts: post 96, learning-development 139, q-a 7, bc_project 6, main-directory 79, each winner type 1.

---

## 3. Taxonomies per Type

| Type | Taxonomies (example terms) |
|---|---|
| post | `category` (Activities, Campaigns, Commercial, Corporate Updates, Fitness…), `post_tag` (fitness classes, group fitness), `post_format` |
| learning-development | `training-group` (All frontline staff, All Staff, Champions, Cleaners…, Dry-side Staff) |
| q-a | none |
| bc_project | `bcph_status` (Archived, Completed, Live) |
| main-directory | `letter` (A, B, C, D, E…) — drives the A–Z index; `main-directory-category` (Forms & Templates, Policies, Governance, News, Activities, Careers & Learning Hub, Recognition & Staff Benefits) |
| winner types | none |
| Users | (ACF taxonomy fields) user_location, user_job_title, champion_status, first-letter-of-first-name |

---

## 4. Oxygen Design Tokens

### Colors (`oxygen_vsb_global_colors`)
Brand set ("Global Colors"):
- `color1` (id16) **#009ec8** — primary cyan/blue (used as section bg color(16))
- `color2` (id17) **#f7b60d** — amber/gold accent
- `color3` (id18) **#005ea1** — deep blue (default text + headings color(18))
- White **#ffffff**, Lighter Blue **#e2e2e2**

Grays ("composite-elements" set): Gray0 #f9f9fa, Gray1 #eceeef, Gray2 #dee1e3, Gray3 #cfd3d7, Gray5 #adb4b9, Gray6 #98a1a8, Gray8 #606e79, Gray9 #374047.

Token mapping in CSS: `color(16)=#009ec8`, `color(17)=#f7b60d`, `color(18)=#005ea1`.

### Typography & global styles (`ct_global_settings`)
- **Font: Poppins** for both Text and Display. Weights loaded: 300, 400 (regular), 500, 600, 700.
- Body: 100%, weight 500, line-height 1.6, color `#005ea1` (color18).
- Headings: H1 2rem/700/color18, H2 1.8rem/700/color18, H3 1.6rem/400, H4–H5 1.6rem, H6 1.2rem; line-height 1.2.
- Links: default color18 → hover color16 (#009ec8), no underline (text links underline on hover). Buttons: border-radius 10px, weight 400.
- Layout: section padding 2em top/bottom, 1em sides; columns 1.5em padding; **max-width 1300px**.
- Breakpoints: tablet 992, phone-landscape 768, phone-portrait 480.
- WooCommerce CTA vars map to brand colors (primary #f7b60d→#005ea1 hover, etc.).
- AOS scroll animations enabled (fade, 600ms). Smooth scroll-to-hash offset 90px.

---

## 5. Oxygen CSS Assets

Directory: `/home/betterco/public_html/wp-content/uploads/oxygen/css/`
Public URL of universal stylesheet: `//betterconnected.me/wp-content/uploads/oxygen/css/universal.css` (version 2.1).

Key files (name — bytes):
- **universal.css — 69,803** (global/universal stylesheet, 2,895 lines) ← the global one
- **2.css — 29,308** (front page id 2's generated CSS)
- 158.css — 32,478 (likely the header/global template)
- 59.css — 3,044; 50.css — 821
- Per-page: 3626.css 13,773 / 3698.css 10,824 / 37615.css 9,522 / 3723.css 7,043 / 36049.css 4,857; plus many small per-template files (192.css, 245.css, 3xxx.css…).

`universal.css` first lines (sample):
```css
.ct-section { width:100%; background-size:cover; background-repeat:repeat; }
.ct-section>.ct-section-inner-wrap { display:flex; flex-direction:column; align-items:flex-start; }
.ct-div-block { display:flex; flex-wrap:nowrap; flex-direction:column; align-items:flex-start; }
.ct-new-columns { display:flex; width:100%; flex-direction:row; align-items:stretch; justify-content:center; flex-wrap:wrap; }
.ct-link-text { display:inline-block; }
.ct-link { display:flex; flex-wrap:wrap; ... }
```
This is the base Oxygen reset/structural CSS (`.ct-*` element defaults). Per-page files hold the `#section-xxx-2` / `.div_block-xxx` styles. Font loading is Google Fonts (Poppins) — `oxygen_vsb_use_css_for_google_fonts` set. To rebuild faithfully, pull `universal.css` + `2.css` (home) + `158.css` (header/global template).

Enqueued handles not separately introspected, but Oxygen enqueues `oxygen-universal-styles` (universal.css) + per-post `oxygen-cache-page-css-<id>`.

---

## 6. Menus

Only **one** WP nav menu exists: **"Main menu"** (term_id 405), 3 items, no theme location assigned:

```
Home            → https://betterconnected.me/            (page id 2)
Main directory  → https://betterconnected.me/main-directory/  (page id 3276)
Sitemap         → https://betterconnected.me/sitemap/    (page id 36301)
```

The real site navigation is NOT this menu — it lives in the Oxygen header template (template, likely id behind 158.css) and the home page's own link blocks/quick-links. Rebuild nav from the home page link blocks (§7) + header template rather than this 3-item WP menu.

---

## 7. Front Page Structure (page id 2)

Builder meta: `_ct_builder_shortcodes` (meta_id 229). 7 top-level `ct_section`s, 227 total elements. Top-level order:

| # | Section selector | ct_id | Content / heading |
|---|---|---|---|
| 1 | `section-821-2` | 821 | **A–Z letter index** (code_block 822). Hidden on tablet (`media.tablet.display=none`). Has a `globalconditions` User Role rule. |
| 2 | `section-50-2` | 50 | **Hero / header band** (bg color16 #009ec8): logo `div_block-60-2`, search bar, and the 5 short-link hero icons. |
| 3 | `section-51-2` | 51 | **Main content grid** ("Sections"): News, Top company perks, Q&A, "Useful Information" link grid, winners dynamic lists. |
| 4 | `section-1828-2` | 1828 | **"Ask the Leadership Team!"** — leadership Q&A engagement block ("Submit a question" / "Read the latest Q&A"). |
| 5 | `section-2410-2` | 2410 | **Training & Development** |
| 6 | `section-2860-2` | 2860 | **Your Wellbeing Hub** |
| 7 | `quicklinks` | 3108 | **Quick links** (section selector literally `quicklinks`) |

All headlines in order: News, Top company perks, Useful Information, "Ask the Leadership Team!", Training & Development, Your Wellbeing Hub, Quick links.

### The three client hide targets

**(a) "A–Z" index above the hero**
- Section: **`#section-821-2`** (ct_id 821) — the very first section.
- Inside it: code_block **`#code_block-822-2`** (ct_id 822), PHP that outputs `<ul class="directory-letter-list">` built from the `letter` taxonomy (links carry `?_letters=` query param).
- Hide target: the whole section `#section-821-2`, or the list `.directory-letter-list`.

**(b) The 5 "short link" hero icons under the search bar**
- The search bar is the Ajax Search Pro shortcode `[wpdreams_ajaxsearchpro id=1]` in **`#shortcode-5978-2`** (inside `div_block-5976-2`, section 50).
- Immediately after it: **`#div_block-5979-2`** (ct_id 5979) — a CSS grid, `grid-column-count: 5`, nicename "Div (#69)", with a `globalconditions` User Role rule. This is the 5-icon row.
- Its 5 children are `ct_link_5` blocks (ct_id 5980, 5983, 5986, 5989, 5992), each = image + text label:
  - 5980/`link-5980-2` → **Governance**
  - 5983/`link-5983-2` → **Policies**
  - 5986/`link-5986-2` → **Recognition & Staff Benefits**
  - 5989/`link-5989-2` → **Training & Development**
  - 5992/`link-5992-2` → **Forms & Templates**
- Hide target: **`#div_block-5979-2`** (removes all 5 at once).

**(c) "Our People Forum" section**
- **No literal "Forum" or "Our People" string exists anywhere in any Oxygen builder content on the site** (searched all `_ct_builder_shortcodes`). So this is the client's informal name for an on-page feature, not a stored label.
- Best match = the front-page leadership Q&A block: **`#section-1828-2`** (ct_id 1828), headline 1812 **"Ask the Leadership Team!"**, with "Submit a question" (text 1819) and "Read the latest Q&A" links. This is the people-engagement/forum-style block.
- Secondary possibility: the "Useful Information" sub-grid in section 51 (div_block 7749, nicename "Casual content only") containing Staff Active Card / Better Ideas / Useful Contacts / Newsletter Submission tiles — but "Ask the Leadership Team!" is the stronger forum candidate.
- **Recommend confirming with the client which on-page block they call "Our People Forum"** before hiding; the section to target is almost certainly `#section-1828-2`.

> Several home-page blocks (821, the 5-icon grid 5979, "Useful Information" grid 7749) carry Oxygen `globalconditions` keyed on **User Role = "casual"** (base64 `Y2FzdWFs`), i.e. visibility already varies by role. Worth preserving in the rebuild.
