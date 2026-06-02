import * as cheerio from 'cheerio'

const ORIGIN = 'https://betterconnected.me'

// Client-requested hides + site-wide non-display elements.
const HIDE_SELECTORS = [
  '#section-821-2', // A–Z index section (home)
  '.directory-letter-list', // A–Z list wherever it appears (site-wide)
  '#div_block-5979-2', // the 5 hero short-link icons under the search bar
  // 'Our People Forum' home block — selector pending client confirmation.
]

// Anchor targets we never want on the public mirror (login/account/forms area).
const DROP_LINK_PATTERNS = [
  '/log-in', '/account', '/register', '/password-reset', '/profile',
]

function toAbsolute(u) {
  if (!u) return u
  if (u.startsWith('//')) return 'https:' + u
  if (u.startsWith('/')) return ORIGIN + u
  return u
}

function isFileOrAsset(href) {
  return (
    href.startsWith('/wp-content') ||
    href.startsWith('/wp-includes') ||
    /\.(pdf|docx?|xlsx?|pptx?|zip|csv|jpe?g|png|gif|webp|svg|mp4)(\?|$)/i.test(href)
  )
}

/**
 * Clean a captured WordPress/Oxygen page into a safe, faithful mirror page.
 * - removes the client's hide-targets, all forms, scripts/analytics
 * - drops login/account nav links
 * - points assets at the live origin; keeps internal page links relative (stay on the mirror)
 */
export function sanitize(html) {
  const $ = cheerio.load(html)

  // 1) client hide-targets
  for (const sel of HIDE_SELECTORS) $(sel).remove()

  // 2) scripts + analytics + GTM noscript
  $('script, noscript').remove()
  $('link[rel="dns-prefetch"], link[rel="preconnect"]').remove()

  // 3) forms: remove all EXCEPT Forminator module shells (form#forminator-module-<id>),
  //    which injectForms() rebuilds natively. Other forms/plugin wrappers are dropped.
  $('form').each((_, el) => {
    if (!/^forminator-module-\d+/.test($(el).attr('id') || '')) $(el).remove()
  })
  $('[class*="gform"], [id*="gform"]').remove()

  // 3b) WP Grid Builder facets are JS-driven and non-functional without JS — drop them
  // (we provide our own native filters where needed).
  $('.wpgb-facet').remove()

  // 3c) Notifications bell — a logged-in-user feature, irrelevant on the display mirror.
  $('a[href*="/notifications"], .notificationCircle, .notification-count').remove()

  // 4) login/account/register links → drop their list item (or the link)
  for (const pat of DROP_LINK_PATTERNS) {
    $(`a[href*="${pat}"]`).each((_, a) => {
      const li = $(a).closest('li')
      if (li.length) li.remove()
      else $(a).remove()
    })
  }

  // 5) asset URLs → absolute to the live origin
  $('[src]').each((_, el) => $(el).attr('src', toAbsolute($(el).attr('src'))))
  $('link[href]').each((_, el) => $(el).attr('href', toAbsolute($(el).attr('href'))))
  $('[srcset]').each((_, el) => {
    const v = $(el).attr('srcset')
    if (!v) return
    $(el).attr(
      'srcset',
      v
        .split(',')
        .map((part) => {
          const [url, d] = part.trim().split(/\s+/)
          return toAbsolute(url) + (d ? ' ' + d : '')
        })
        .join(', ')
    )
  })

  // 6) anchors: internal page links stay relative (navigate the mirror); files → absolute
  $('a[href]').each((_, el) => {
    let href = $(el).attr('href')
    if (!href) return
    if (href.startsWith(ORIGIN)) href = href.slice(ORIGIN.length) || '/'
    else if (href.startsWith('//betterconnected.me')) href = href.slice('//betterconnected.me'.length) || '/'
    if (href.startsWith('/') && isFileOrAsset(href)) $(el).attr('href', toAbsolute(href))
    else $(el).attr('href', href)
  })

  // WP Grid Builder hides grids/facets with opacity until its JS runs; we strip JS,
  // so the (server-rendered) cards stay invisible. Force them visible.
  $('head').append(
    '<style id="bcc-overrides">' +
      '.wp-grid-builder:not(.wpgb-template),.wpgb-grid,.wpgb-content{opacity:1 !important;}' +
    '</style>'
  )

  return $.html()
}
