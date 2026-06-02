import * as cheerio from 'cheerio'

const SITE = (process.env.WP_SITE_URL || 'https://betterconnected.me').replace(/\/$/, '')
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.WP_API_USERNAME || ''}:${process.env.WP_API_PASSWORD || ''}`).toString('base64')

// Forms approved to be live on the mirror. Simple text forms first; upload (5),
// e-signature (2) and captcha (1) forms are enabled in their own later rounds.
export const ENABLED_FORMS = new Set([
  3884, // myzone-request
  36683, // become-a-wellbeing-champion
  38127, // safety-pulse-questions-suggestions
  3599, // better-ideas (mad-ideas-submission-form)
  37317, // survey-request
])

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function getSchema(id) {
  const r = await fetch(`${SITE}/wp-json/bcc/v1/form/${id}`, {
    headers: { Authorization: AUTH },
    next: { revalidate: 300, tags: ['bcc'] },
  })
  if (!r.ok) throw new Error(`schema ${id} -> ${r.status}`)
  return r.json()
}

function renderField(f) {
  const id = f.element_id
  const req = f.required ? ' required' : ''
  const star = f.required ? ' <span class="forminator-required">*</span>' : ''
  const label = f.label ? `<label class="forminator-label" for="bcc-${esc(id)}">${esc(f.label)}${star}</label>` : ''
  const desc = f.description ? `<span class="forminator-description">${esc(f.description)}</span>` : ''
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''

  switch (f.type) {
    case 'section':
      return `<div class="forminator-row forminator-section"><h3 class="forminator-section-title">${esc(f.section_title || f.label)}</h3>${
        f.section_subtitle ? `<p class="forminator-section-subtitle">${esc(f.section_subtitle)}</p>` : ''
      }</div>`
    case 'html':
      return `<div class="forminator-row forminator-html">${f.html || ''}</div>`
    case 'textarea':
      return `<div class="forminator-row">${label}<textarea class="forminator-textarea" id="bcc-${esc(id)}" name="${esc(id)}" rows="${f.rows || 4}"${ph}${req}></textarea>${desc}</div>`
    case 'email':
      return `<div class="forminator-row">${label}<input class="forminator-input" type="email" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
    case 'phone':
      return `<div class="forminator-row">${label}<input class="forminator-input" type="tel" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
    case 'number':
      return `<div class="forminator-row">${label}<input class="forminator-input" type="number" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
    case 'url':
      return `<div class="forminator-row">${label}<input class="forminator-input" type="url" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
    case 'date':
      return `<div class="forminator-row">${label}<input class="forminator-input" type="date" id="bcc-${esc(id)}" name="${esc(id)}"${req}>${desc}</div>`
    case 'upload': {
      const multi = !!f.multiple
      const nm = multi ? `${esc(id)}[]` : esc(id)
      const note = f.filesize ? `Max ${esc(f.filesize)}MB${f.extensions ? `, allowed: ${esc(f.extensions)}` : ''}.` : ''
      return `<div class="forminator-row">${label}<input class="forminator-input forminator-upload" type="file" id="bcc-${esc(id)}" name="${nm}"${multi ? ' multiple' : ''}${req}>${
        note ? `<span class="forminator-description">${note}</span>` : ''
      }${desc}</div>`
    }
    case 'select': {
      const opts = (f.options || []).map((o) => `<option value="${esc(o.value)}">${esc(o.label || o.value)}</option>`).join('')
      const multi = f.multiple ? ' multiple' : ''
      const nm = f.multiple ? `${esc(id)}[]` : esc(id)
      return `<div class="forminator-row">${label}<select class="forminator-select" id="bcc-${esc(id)}" name="${nm}"${multi}${req}>${
        f.multiple ? '' : `<option value="">${esc(f.placeholder || 'Please select…')}</option>`
      }${opts}</select>${desc}</div>`
    }
    case 'radio': {
      const opts = (f.options || [])
        .map(
          (o, i) =>
            `<label class="forminator-radio"><input type="radio" name="${esc(id)}" value="${esc(o.value)}"${i === 0 && f.required ? req : ''}> <span>${esc(o.label || o.value)}</span></label>`
        )
        .join('')
      return `<div class="forminator-row forminator-row-choices">${label}<div class="forminator-choices">${opts}</div>${desc}</div>`
    }
    case 'checkbox': {
      const opts = (f.options || [])
        .map(
          (o) =>
            `<label class="forminator-checkbox"><input type="checkbox" name="${esc(id)}[]" value="${esc(o.value)}"> <span>${esc(o.label || o.value)}</span></label>`
        )
        .join('')
      return `<div class="forminator-row forminator-row-choices">${label}<div class="forminator-choices">${opts}</div>${desc}</div>`
    }
    case 'name': {
      if (f.multiple && (f.cols || []).length) {
        const cols = f.cols
          .map((c) => {
            const creq = c.required ? ' required' : ''
            const cstar = c.required ? ' <span class="forminator-required">*</span>' : ''
            const cph = c.placeholder ? ` placeholder="${esc(c.placeholder)}"` : ''
            return `<div class="forminator-col">${c.label ? `<label class="forminator-label">${esc(c.label)}${cstar}</label>` : ''}<input class="forminator-input" type="text" name="${esc(id)}-${esc(c.key)}"${cph}${creq}></div>`
          })
          .join('')
        return `<div class="forminator-row forminator-name-multiple">${label}<div class="forminator-cols">${cols}</div>${desc}</div>`
      }
      return `<div class="forminator-row">${label}<input class="forminator-input" type="text" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
    }
    default:
      return `<div class="forminator-row">${label}<input class="forminator-input" type="text" id="bcc-${esc(id)}" name="${esc(id)}"${ph}${req}>${desc}</div>`
  }
}

function renderForm(schema) {
  const fields = (schema.fields || []).map(renderField).join('\n')
  return `<form class="forminator-custom-form bcc-form" data-bcc-form-id="${schema.id}" data-thankyou="${esc(schema.thankyou)}">
    <div class="forminator-response-message" hidden></div>
    <div class="bcc-form-fields">${fields}</div>
    <div class="forminator-row forminator-submit">
      <button type="submit" class="forminator-button forminator-button-submit">${esc(schema.submit_label || 'Submit')}</button>
    </div>
  </form>`
}

// Pages whose Oxygen template renders a title but NOT the form shortcode, so there's
// no shell to replace. Inject the native form after the page title instead.
// Key = page path (no leading/trailing slash), value = Forminator form id.
const PAGE_FALLBACK_FORMS = {
  'main-directory/survey-request-form': 37317,
}

export async function injectForms(html, slug = '') {
  const fallbackId = PAGE_FALLBACK_FORMS[slug]
  if (!html || (html.indexOf('forminator-module-') === -1 && !fallbackId)) return html
  const $ = cheerio.load(html)

  let injected = false
  const injectedIds = new Set()
  for (const el of $('[id^="forminator-module-"]').toArray()) {
    const m = ($(el).attr('id') || '').match(/forminator-module-(\d+)/)
    if (!m) continue
    const fid = parseInt(m[1], 10)
    if (!ENABLED_FORMS.has(fid)) {
      $(el).remove() // form not approved for the mirror → don't show it
      continue
    }
    try {
      const schema = await getSchema(fid)
      $(el).replaceWith(renderForm(schema))
      injected = true
      injectedIds.add(fid)
    } catch (e) {
      $(el).remove()
    }
  }

  // Fallback: the template never emitted the form shell — place it after the title.
  if (fallbackId && ENABLED_FORMS.has(fallbackId) && !injectedIds.has(fallbackId)) {
    try {
      const schema = await getSchema(fallbackId)
      const block = `<section class="ct-section bcc-form-fallback"><div class="ct-section-inner-wrap">${renderForm(schema)}</div></section>`
      let anchor = $('section').filter((_, el) => $(el).find('h1').length > 0).first()
      if (!anchor.length) anchor = $('h1').first().closest('section')
      if (anchor.length) {
        anchor.after(block)
        injected = true
      }
    } catch (e) {
      /* leave page as-is if the schema can't be fetched */
    }
  }

  if (injected) {
    $('head').append(`<style id="bcc-form-css">${FORM_CSS}</style>`)
    $('body').append(`<script id="bcc-form-js">${FORM_JS}</script>`)
  }
  return $.html()
}

const FORM_CSS = `
.bcc-form{max-width:680px;margin:0 auto;font-family:var(--font-poppins),Poppins,sans-serif}
.bcc-form .forminator-row{margin:0 0 18px}
.bcc-form .forminator-label{display:block;font:500 14px Poppins,sans-serif;color:#063b63;margin:0 0 7px}
.bcc-form .forminator-required{color:#c0392b}
.bcc-form .forminator-input,.bcc-form .forminator-textarea,.bcc-form .forminator-select{width:100%;box-sizing:border-box;font:400 15px Poppins,sans-serif;color:#063b63;border:1.5px solid #d8e3ec;border-radius:10px;padding:12px 15px;outline:none;background:#fff}
.bcc-form .forminator-input:focus,.bcc-form .forminator-textarea:focus,.bcc-form .forminator-select:focus{border-color:#009ec8}
.bcc-form .forminator-textarea{resize:vertical;min-height:120px}
.bcc-form .forminator-description{display:block;font:400 12px Poppins,sans-serif;color:#90a1b0;margin-top:6px}
.bcc-form .forminator-section-title{font:600 19px Poppins,sans-serif;color:#063b63;margin:28px 0 4px;padding-top:14px;border-top:1px solid #eef2f6}
.bcc-form .forminator-section-subtitle{font:400 14px Poppins,sans-serif;color:#5a6b7a;margin:0 0 4px}
.bcc-form .forminator-cols{display:flex;gap:14px;flex-wrap:wrap}
.bcc-form .forminator-col{flex:1;min-width:160px}
.bcc-form .forminator-choices{display:flex;flex-direction:column;gap:8px}
.bcc-form .forminator-radio,.bcc-form .forminator-checkbox{display:flex;align-items:center;gap:8px;font:400 14px Poppins,sans-serif;color:#063b63;cursor:pointer}
.bcc-form .forminator-button-submit{font:600 15px Poppins,sans-serif;color:#fff;background:#009ec8;border:none;border-radius:10px;padding:14px 28px;cursor:pointer}
.bcc-form .forminator-button-submit:hover{background:#0089ad}
.bcc-form .forminator-button-submit:disabled{opacity:.6;cursor:default}
.bcc-form .forminator-response-message{border-radius:10px;padding:14px 16px;margin:0 0 18px;font:500 14px Poppins,sans-serif}
.bcc-form .forminator-response-message.bcc-error{background:#fdeceb;color:#c0392b;border:1px solid #f5c6c2}
.bcc-form .forminator-response-message.bcc-success{background:#e8f7ee;color:#1e7e45;border:1px solid #bfe6cd}
`

const FORM_JS = `(function(){
  document.querySelectorAll('form.bcc-form').forEach(function(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var msg=form.querySelector('.forminator-response-message');
      var btn=form.querySelector('.forminator-button-submit');
      var fd=new FormData(form);
      fd.append('form_id',form.getAttribute('data-bcc-form-id'));
      fd.append('current_url',location.href);
      if(btn){btn.disabled=true;}
      fetch('/api/forms/submit/',{method:'POST',body:fd})
        .then(function(r){return r.json();})
        .then(function(d){
          if(d && d.success){
            form.innerHTML='<div class="forminator-response-message bcc-success">'+((typeof d.data==='string'&&d.data)?d.data:(form.getAttribute('data-thankyou')||'Thank you. Your submission has been received.'))+'</div>';
            form.scrollIntoView({behavior:'smooth',block:'center'});
          } else {
            if(msg){msg.className='forminator-response-message bcc-error';msg.hidden=false;msg.innerHTML=(d&&typeof d.data==='string'&&d.data)?d.data:'Sorry, something went wrong. Please check the form and try again.';}
            if(btn){btn.disabled=false;}
          }
        })
        .catch(function(){
          if(msg){msg.className='forminator-response-message bcc-error';msg.hidden=false;msg.textContent='Network error. Please try again.';}
          if(btn){btn.disabled=false;}
        });
    });
  });
})();`
