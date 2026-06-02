// Standalone validation: fetch via the render endpoint, sanitize, report stats.
// Run: node scripts/test-render.mjs
import fs from 'node:fs'
import * as cheerio from 'cheerio'
import { sanitize } from '../lib/sanitize.mjs'

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const SITE = env.WP_SITE_URL
const AUTH = 'Basic ' + Buffer.from(`${env.WP_API_USERNAME}:${env.WP_API_PASSWORD}`).toString('base64')

async function render(id) {
  const r = await fetch(`${SITE}/wp-json/bcc/v1/render?id=${id}`, { headers: { Authorization: AUTH } })
  if (!r.ok) throw new Error(`render ${id} -> ${r.status}`)
  const d = await r.json()
  return d.html
}

for (const [name, id] of [['home', 2], ['news', 38347]]) {
  const raw = await render(id)
  const clean = sanitize(raw)
  fs.writeFileSync(`/tmp/bcc-${name}.html`, clean)
  const $r = cheerio.load(raw)
  const $c = cheerio.load(clean)
  console.log(`\n=== ${name} (id ${id}) ===`)
  console.log('len raw -> clean :', raw.length, '->', clean.length)
  console.log('scripts raw/clean:', $r('script').length, '/', $c('script').length)
  console.log('forms   raw/clean:', $r('form').length, '/', $c('form').length)
  console.log('A–Z #section-821-2  raw/clean:', $r('#section-821-2').length, '/', $c('#section-821-2').length)
  console.log('A–Z .directory-letter-list raw/clean:', $r('.directory-letter-list').length, '/', $c('.directory-letter-list').length)
  console.log('hero #div_block-5979-2 raw/clean:', $r('#div_block-5979-2').length, '/', $c('#div_block-5979-2').length)
  console.log('css <link> count (clean):', $c('link[rel="stylesheet"]').length)
  console.log('first css href:', $c('link[rel="stylesheet"]').first().attr('href'))
  console.log('sample anchor hrefs:', $c('a[href]').slice(0, 6).map((_, a) => $c(a).attr('href')).get())
  console.log('sample img src:', $c('img[src]').first().attr('src'))
}
console.log('\nWrote /tmp/bcc-home.html and /tmp/bcc-news.html')
