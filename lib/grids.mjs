import * as cheerio from 'cheerio'

const SITE = (process.env.WP_SITE_URL || 'https://betterconnected.me').replace(/\/$/, '')

async function getJSON(url) {
  const r = await fetch(url, { next: { revalidate: 300 } })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}
const esc = (s) => (s || '').replace(/"/g, '&quot;')

/**
 * Replace the (JS-dependent, empty) WP Grid Builder news grid with a native,
 * server-rendered card grid + a client-side category/search filter.
 */
export async function injectNewsGrid(html) {
  const $ = cheerio.load(html)
  const container = $('.wp-grid-builder').first()
  if (!container.length) return html

  // _embed 500s (author embed hits a WPUM bug), so fetch pieces separately.
  const posts = await getJSON(
    `${SITE}/wp-json/wp/v2/posts?per_page=48&_fields=id,title,excerpt,date,link,categories,featured_media`
  )
  const cats = await getJSON(`${SITE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`)
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))

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
          ${catName ? `<span class="bcc-card-cat">${catName}</span>` : ''}
          <h3 class="bcc-card-title">${title}</h3>
          <p class="bcc-card-excerpt">${excerpt}</p>
          <span class="bcc-card-date">${fmtDate(p.date)}</span>
        </div>
      </a>`
    })
    .join('\n')

  const chips =
    `<button class="bcc-chip is-active" data-cat="all">All</button>` +
    usedCats.map((c) => `<button class="bcc-chip" data-cat="${c.id}">${c.name}</button>`).join('')

  container.empty().append(
    `<div class="bcc-grid-wrap">
      <div class="bcc-filter">${chips}<input class="bcc-search" type="search" placeholder="Search news…" aria-label="Search news"></div>
      <div class="bcc-grid">${cards}</div>
      <p class="bcc-empty" hidden>No matching news.</p>
    </div>`
  )
  container.attr('style', 'opacity:1!important')

  $('head').append(`<style id="bcc-grid-css">${GRID_CSS}</style>`)
  $('body').append(`<script id="bcc-grid-js">${GRID_JS}</script>`)
  return $.html()
}

const GRID_CSS = `
.bcc-grid-wrap{font-family:var(--font-poppins),Poppins,sans-serif;max-width:1300px;margin:0 auto;padding:8px 16px 48px}
.bcc-filter{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 28px}
.bcc-chip{font:500 14px/1 Poppins,sans-serif;color:#005ea1;background:#fff;border:1.5px solid #d8e3ec;border-radius:999px;padding:9px 16px;cursor:pointer;transition:.15s}
.bcc-chip:hover{border-color:#009ec8}
.bcc-chip.is-active{background:#009ec8;border-color:#009ec8;color:#fff}
.bcc-search{margin-left:auto;font:400 14px Poppins,sans-serif;color:#063b63;border:1.5px solid #d8e3ec;border-radius:999px;padding:9px 18px;min-width:220px;outline:none}
.bcc-search:focus{border-color:#009ec8}
.bcc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.bcc-card{display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;text-decoration:none;box-shadow:0 1px 3px rgba(0,40,80,.08);border:1px solid #eef2f6;transition:transform .18s,box-shadow .18s}
.bcc-card:hover{transform:translateY(-4px);box-shadow:0 12px 28px rgba(0,40,80,.14)}
.bcc-card-img{aspect-ratio:16/10;background-size:cover;background-position:center;background-color:#e8eef3}
.bcc-card-body{padding:18px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.bcc-card-cat{align-self:flex-start;font:600 11px/1 Poppins,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#009ec8;background:#e6f6fb;padding:5px 10px;border-radius:6px}
.bcc-card-title{font:600 18px/1.3 Poppins,sans-serif;color:#063b63;margin:2px 0 0}
.bcc-card-excerpt{font:400 14px/1.5 Poppins,sans-serif;color:#5a6b7a;margin:0;flex:1}
.bcc-card-date{font:500 12px Poppins,sans-serif;color:#90a1b0;margin-top:6px}
.bcc-empty{text-align:center;color:#5a6b7a;padding:40px}
@media(max-width:600px){.bcc-search{margin-left:0;width:100%}}
`

const GRID_JS = `(function(){
  var root=document.querySelector('.bcc-grid-wrap');if(!root)return;
  var chips=root.querySelectorAll('.bcc-chip'),cards=root.querySelectorAll('.bcc-card'),search=root.querySelector('.bcc-search'),empty=root.querySelector('.bcc-empty');
  var cat='all',q='';
  function apply(){var n=0;cards.forEach(function(c){
    var okCat=cat==='all'||((' '+c.getAttribute('data-cats')+' ').indexOf(' '+cat+' ')>-1);
    var okQ=!q||c.getAttribute('data-title').indexOf(q)>-1;
    var show=okCat&&okQ;c.style.display=show?'':'none';if(show)n++;});
    if(empty)empty.hidden=n>0;}
  chips.forEach(function(ch){ch.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('is-active')});ch.classList.add('is-active');cat=ch.getAttribute('data-cat');apply();});});
  if(search)search.addEventListener('input',function(){q=search.value.toLowerCase().trim();apply();});
})();`
