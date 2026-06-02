import * as cheerio from 'cheerio'

const SITE = (process.env.WP_SITE_URL || 'https://betterconnected.me').replace(/\/$/, '')
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.WP_API_USERNAME || ''}:${process.env.WP_API_PASSWORD || ''}`).toString('base64')

async function getJSON(url, auth = false) {
  const r = await fetch(url, {
    headers: auth ? { Authorization: AUTH } : {},
    next: { revalidate: 300 },
  })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const dec = (s) => (s || '').replace(/&amp;/g, '&').replace(/&#0?38;/g, '&')
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function gridContainer($) {
  return $('.wp-grid-builder').first()
}

function mount($, container, inner) {
  container.empty().append(`<div class="bcc-grid-wrap">${inner}</div>`)
  container.attr('style', 'opacity:1!important')
  $('head').append(`<style id="bcc-grid-css">${GRID_CSS}</style>`)
  $('body').append(`<script id="bcc-grid-js">${GRID_JS}</script>`)
  return $.html()
}

/* ---------------- News ---------------- */
export async function injectNewsGrid(html) {
  const $ = cheerio.load(html)
  const container = gridContainer($)
  if (!container.length) return html

  const posts = await getJSON(
    `${SITE}/wp-json/wp/v2/posts?per_page=48&_fields=id,title,excerpt,date,link,categories,featured_media`
  )
  const cats = await getJSON(`${SITE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`)
  const catMap = Object.fromEntries(cats.map((c) => [c.id, dec(c.name)]))
  const mediaIds = [...new Set(posts.map((p) => p.featured_media).filter(Boolean))]
  let mediaMap = {}
  if (mediaIds.length) {
    const media = await getJSON(
      `${SITE}/wp-json/wp/v2/media?include=${mediaIds.join(',')}&per_page=100&_fields=id,source_url`
    )
    mediaMap = Object.fromEntries(media.map((m) => [m.id, m.source_url]))
  }
  const usedCats = [...new Set(posts.flatMap((p) => p.categories || []))]
    .map((id) => ({ id, name: catMap[id] }))
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  const cards = posts
    .map((p) => {
      const img = mediaMap[p.featured_media] || ''
      const catName = catMap[(p.categories || [])[0]] || ''
      const title = strip(p.title?.rendered)
      const excerpt = strip(p.excerpt?.rendered).slice(0, 140)
      const href = p.link ? p.link.replace(SITE, '') : '#'
      return `<a class="bcc-card" href="${esc(href)}" data-cats="${(p.categories || []).join(' ')}" data-title="${esc(title.toLowerCase())}">
        <div class="bcc-card-img${img ? '' : ' bcc-noimg'}"${img ? ` style="background-image:url('${esc(img)}')"` : ''}></div>
        <div class="bcc-card-body">
          ${catName ? `<span class="bcc-card-cat">${esc(catName)}</span>` : ''}
          <h3 class="bcc-card-title">${esc(title)}</h3>
          <p class="bcc-card-excerpt">${esc(excerpt)}</p>
          <span class="bcc-card-date">${fmtDate(p.date)}</span>
        </div>
      </a>`
    })
    .join('\n')

  const chips =
    `<button class="bcc-chip is-active" data-group="cat" data-val="all">All</button>` +
    usedCats.map((c) => `<button class="bcc-chip" data-group="cat" data-val="${c.id}">${esc(c.name)}</button>`).join('')

  return mount(
    $,
    container,
    `<div class="bcc-filter">${chips}<input class="bcc-search" type="search" placeholder="Search news…" aria-label="Search news"></div>
     <div class="bcc-grid">${cards}</div>
     <p class="bcc-empty" hidden>No matching news.</p>`
  )
}

/* ---------------- Staff directory (people) ---------------- */
export async function injectDirectoryGrid(html) {
  const $ = cheerio.load(html)
  const container = gridContainer($)
  if (!container.length) return html

  const people = await getJSON(`${SITE}/wp-json/bcc/v1/directory`, true)
  const roles = [...new Set(people.flatMap((p) => (p.roles || []).map(dec)))].sort((a, b) => a.localeCompare(b))
  const locs = [...new Set(people.map((p) => dec(p.location)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const letters = [...new Set(people.map((p) => (p.letter || '').toUpperCase()).filter(Boolean))].sort()

  const cards = people
    .map((p) => {
      const name = dec(p.name)
      const role = dec((p.roles || [])[0] || '')
      const loc = dec(p.location || '')
      const rolesAttr = (p.roles || []).map(dec).join('|')
      return `<div class="bcc-card bcc-person" data-title="${esc(name.toLowerCase())}" data-letter="${esc((p.letter || '').toUpperCase())}" data-location="${esc(loc)}" data-roles="${esc(rolesAttr)}">
        <div class="bcc-avatar"${p.avatar ? ` style="background-image:url('${esc(p.avatar)}')"` : ''}></div>
        <h3 class="bcc-person-name">${esc(name)}</h3>
        ${role ? `<p class="bcc-person-role">${esc(role)}</p>` : ''}
        ${loc ? `<p class="bcc-person-loc">${esc(loc)}</p>` : ''}
      </div>`
    })
    .join('\n')

  const letterChips =
    `<button class="bcc-chip is-active" data-group="letter" data-val="all">All</button>` +
    letters.map((l) => `<button class="bcc-chip" data-group="letter" data-val="${l}">${l}</button>`).join('')

  return mount(
    $,
    container,
    `<div class="bcc-filter">
        <input class="bcc-search" type="search" placeholder="Search people…" aria-label="Search people">
        <select class="bcc-select" data-group="role"><option value="">All roles</option>${roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
        <select class="bcc-select" data-group="location"><option value="">All locations</option>${locs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('')}</select>
     </div>
     <div class="bcc-letters">${letterChips}</div>
     <div class="bcc-grid bcc-grid-people">${cards}</div>
     <p class="bcc-empty" hidden>No matching people.</p>`
  )
}

/* ---------------- Document library (main-directory) ---------------- */
export async function injectDocumentsGrid(html) {
  const $ = cheerio.load(html)
  const container = gridContainer($)
  if (!container.length) return html

  const docs = await getJSON(`${SITE}/wp-json/bcc/v1/documents`, true)
  const cats = [...new Set(docs.flatMap((d) => (d.category || []).map(dec)))].sort((a, b) => a.localeCompare(b))

  const cards = docs
    .map((d) => {
      const title = dec(d.title)
      const catAttr = (d.category || []).map(dec).join('|')
      const links = (d.links || [])
        .filter((l) => l.url)
        .map(
          (l) =>
            `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(dec(l.title) || 'Open')}<span aria-hidden="true"> ↗</span></a></li>`
        )
        .join('')
      return `<div class="bcc-card bcc-doc" data-title="${esc(title.toLowerCase())}" data-cats="${esc(catAttr)}">
        <h3 class="bcc-doc-title">${esc(title)}</h3>
        ${links ? `<ul class="bcc-doc-links">${links}</ul>` : ''}
      </div>`
    })
    .join('\n')

  const chips =
    `<button class="bcc-chip is-active" data-group="cat" data-val="all">All</button>` +
    cats.map((c) => `<button class="bcc-chip" data-group="cat" data-val="${esc(c)}">${esc(c)}</button>`).join('')

  return mount(
    $,
    container,
    `<div class="bcc-filter">${chips}<input class="bcc-search" type="search" placeholder="Search documents…" aria-label="Search documents"></div>
     <div class="bcc-grid bcc-grid-docs">${cards}</div>
     <p class="bcc-empty" hidden>No matching documents.</p>`
  )
}

/* ---------------- shared styles + filter logic ---------------- */
const GRID_CSS = `
.bcc-grid-wrap{font-family:var(--font-poppins),Poppins,sans-serif;max-width:1300px;margin:0 auto;padding:8px 16px 48px}
.bcc-filter{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px}
.bcc-chip{font:500 14px/1 Poppins,sans-serif;color:#005ea1;background:#fff;border:1.5px solid #d8e3ec;border-radius:999px;padding:9px 15px;cursor:pointer;transition:.15s}
.bcc-chip:hover{border-color:#009ec8}
.bcc-chip.is-active{background:#009ec8;border-color:#009ec8;color:#fff}
.bcc-select{font:500 14px Poppins,sans-serif;color:#005ea1;background:#fff;border:1.5px solid #d8e3ec;border-radius:999px;padding:9px 16px;cursor:pointer;outline:none}
.bcc-select:focus{border-color:#009ec8}
.bcc-search{margin-left:auto;font:400 14px Poppins,sans-serif;color:#063b63;border:1.5px solid #d8e3ec;border-radius:999px;padding:9px 18px;min-width:220px;outline:none}
.bcc-search:focus{border-color:#009ec8}
.bcc-letters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 24px}
.bcc-letters .bcc-chip{padding:7px 12px;min-width:38px;text-align:center}
.bcc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.bcc-grid-people{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.bcc-grid-docs{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.bcc-card{display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;text-decoration:none;box-shadow:0 1px 3px rgba(0,40,80,.08);border:1px solid #eef2f6;transition:transform .18s,box-shadow .18s}
a.bcc-card:hover{transform:translateY(-4px);box-shadow:0 12px 28px rgba(0,40,80,.14)}
.bcc-card-img{aspect-ratio:16/10;background-size:cover;background-position:center;background-color:#e8eef3}
.bcc-card-body{padding:18px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.bcc-card-cat{align-self:flex-start;font:600 11px/1 Poppins,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#009ec8;background:#e6f6fb;padding:5px 10px;border-radius:6px}
.bcc-card-title{font:600 18px/1.3 Poppins,sans-serif;color:#063b63;margin:2px 0 0}
.bcc-card-excerpt{font:400 14px/1.5 Poppins,sans-serif;color:#5a6b7a;margin:0;flex:1}
.bcc-card-date{font:500 12px Poppins,sans-serif;color:#90a1b0;margin-top:6px}
.bcc-person{align-items:center;text-align:center;padding:24px 16px}
.bcc-avatar{width:84px;height:84px;border-radius:50%;background:#e8eef3 center/cover no-repeat;margin-bottom:14px}
.bcc-person-name{font:600 16px/1.3 Poppins,sans-serif;color:#063b63;margin:0}
.bcc-person-role{font:500 13px/1.3 Poppins,sans-serif;color:#009ec8;margin:4px 0 0}
.bcc-person-loc{font:400 12px/1.3 Poppins,sans-serif;color:#90a1b0;margin:3px 0 0}
.bcc-doc{padding:20px}
.bcc-doc-title{font:600 16px/1.35 Poppins,sans-serif;color:#063b63;margin:0 0 10px}
.bcc-doc-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.bcc-doc-links a{font:500 14px Poppins,sans-serif;color:#005ea1;text-decoration:none}
.bcc-doc-links a:hover{color:#009ec8;text-decoration:underline}
.bcc-empty{text-align:center;color:#5a6b7a;padding:40px}
@media(max-width:600px){.bcc-search{margin-left:0;width:100%}}
`

const GRID_JS = `(function(){
  document.querySelectorAll('.bcc-grid-wrap').forEach(function(root){
    var cards=root.querySelectorAll('.bcc-card'),empty=root.querySelector('.bcc-empty'),state={};
    var M={
      q:function(c,v){return !v||(c.getAttribute('data-title')||'').indexOf(v)>-1;},
      letter:function(c,v){return !v||v==='all'||c.getAttribute('data-letter')===v;},
      location:function(c,v){return !v||c.getAttribute('data-location')===v;},
      role:function(c,v){return !v||('|'+(c.getAttribute('data-roles')||'')+'|').indexOf('|'+v+'|')>-1;},
      cat:function(c,v){return !v||v==='all'||('|'+(c.getAttribute('data-cats')||'')+'|').indexOf('|'+v+'|')>-1||(' '+(c.getAttribute('data-cats')||'')+' ').indexOf(' '+v+' ')>-1;}
    };
    function apply(){var n=0;cards.forEach(function(c){var ok=true;for(var g in state){var m=M[g];if(m&&!m(c,state[g])){ok=false;break;}}c.style.display=ok?'':'none';if(ok)n++;});if(empty)empty.hidden=n>0;}
    root.querySelectorAll('.bcc-chip').forEach(function(ch){ch.addEventListener('click',function(){var g=ch.getAttribute('data-group');root.querySelectorAll('.bcc-chip[data-group="'+g+'"]').forEach(function(x){x.classList.remove('is-active')});ch.classList.add('is-active');state[g]=ch.getAttribute('data-val');apply();});});
    root.querySelectorAll('.bcc-select').forEach(function(s){s.addEventListener('change',function(){state[s.getAttribute('data-group')]=s.value;apply();});});
    root.querySelectorAll('.bcc-search').forEach(function(s){s.addEventListener('input',function(){state.q=s.value.toLowerCase().trim();apply();});});
  });
})();`
