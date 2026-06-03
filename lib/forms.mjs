import * as cheerio from 'cheerio'

const SITE = (process.env.WP_SITE_URL || 'https://betterconnected.me').replace(/\/$/, '')
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.WP_API_USERNAME || ''}:${process.env.WP_API_PASSWORD || ''}`).toString('base64')

// Forms approved to be live on the mirror: 5 simple text, 1 single-file + 4 multi-file
// upload (staged via /api/forms/upload), 1 captcha (contact), 2 e-signature.
export const ENABLED_FORMS = new Set([
  3884, // myzone-request
  36683, // become-a-wellbeing-champion
  38127, // safety-pulse-questions-suggestions
  3599, // better-ideas (mad-ideas-submission-form)
  37317, // survey-request
  37066, // campaign-feedback (single-file upload)
  3888, // portal-feedback (multiple-file upload — staged via /api/forms/upload)
  37894, // quarterly-nomination (multiple-file upload — staged)
  37896, // special-recognition (multiple-file upload — staged)
  36355, // fslt-newsletter (multiple-file upload — staged)
  53, // contact-form (captcha bypassed server-side — internal tool)
  36425, // friends-&-family (e-signature)
  36386, // active-staff-card (e-signature)
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
    case 'captcha':
    case 'hidden':
      // Captcha is bypassed server-side (internal tool); hidden fields aren't user input.
      return ''
    case 'upload': {
      const note = f.filesize ? `Max ${esc(f.filesize)}MB${f.multiple ? ' each' : ''}${f.extensions ? `, allowed: ${esc(f.extensions)}` : ''}.` : ''
      if (f.multiple) {
        // Each chosen file is staged to the bridge as it's added; the returned temp
        // file_name is submitted as {id}[file][N][file_name] (Forminator's ajax flow).
        return `<div class="forminator-row bcc-upload-row" data-bcc-upload="${esc(id)}"${f.required ? ' data-upload-required="1"' : ''}>${label}
          <input class="forminator-input bcc-upload-input" type="file" multiple>
          ${note ? `<span class="forminator-description">${note}</span>` : ''}
          <ul class="bcc-upload-list"></ul>
          ${desc}</div>`
      }
      return `<div class="forminator-row">${label}<input class="forminator-input forminator-upload" type="file" id="bcc-${esc(id)}" name="${esc(id)}"${req}>${
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
    case 'signature': {
      // Forminator e-signature: the server reads field-{id} (this uniq), builds
      // ctlSignature{uniq}, then reads ctlSignature{uniq}_data_canvas as a base64 PNG
      // data-URL. We render a canvas pad and fill that hidden field with toDataURL().
      const uniq = 'bcc' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      const sigId = 'ctlSignature' + uniq
      return `<div class="forminator-row bcc-sig-row">${label}
        <div class="bcc-sig-pad"${f.required ? ' data-sig-required="1"' : ''}>
          <canvas class="bcc-sig-canvas" height="180"></canvas>
          <span class="bcc-sig-placeholder">Sign here</span>
          <button type="button" class="bcc-sig-clear">Clear</button>
        </div>
        <input type="hidden" name="field-${esc(id)}" value="${uniq}">
        <input type="hidden" class="bcc-sig-data" name="${sigId}_data_canvas" value="">
        ${desc}</div>`
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
.bcc-form .bcc-sig-pad{position:relative;border:1.5px solid #d8e3ec;border-radius:10px;background:#fff;overflow:hidden}
.bcc-form .bcc-sig-pad.bcc-sig-error{border-color:#c0392b}
.bcc-form .bcc-sig-canvas{display:block;width:100%;height:180px;touch-action:none;cursor:crosshair}
.bcc-form .bcc-sig-placeholder{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;color:#b3c1cd;font:400 14px Poppins,sans-serif;pointer-events:none}
.bcc-form .bcc-sig-clear{position:absolute;top:8px;right:8px;font:500 12px Poppins,sans-serif;color:#5a6b7a;background:#f3f6f9;border:1px solid #d8e3ec;border-radius:7px;padding:5px 10px;cursor:pointer}
.bcc-form .bcc-sig-clear:hover{color:#063b63;background:#e8eef3}
.bcc-form .bcc-upload-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.bcc-form .bcc-upload-item{display:flex;align-items:center;gap:8px;font:400 13px Poppins,sans-serif;color:#063b63;background:#f3f6f9;border:1px solid #e0e8ef;border-radius:8px;padding:7px 10px}
.bcc-form .bcc-upload-item.bcc-upload-ok{border-color:#bfe6cd;background:#f0faf4}
.bcc-form .bcc-upload-item.bcc-upload-err{border-color:#f5c6c2;background:#fdeceb;color:#c0392b}
.bcc-form .bcc-upload-name{flex:1;word-break:break-all}
.bcc-form .bcc-upload-remove{background:none;border:none;color:#90a1b0;cursor:pointer;font-size:14px;line-height:1;padding:2px 4px}
.bcc-form .bcc-upload-remove:hover{color:#c0392b}
`

const FORM_JS = `(function(){
  // E-signature pads: draw on a canvas, stash the PNG data-URL in the hidden field
  // Forminator reads (ctlSignature{uniq}_data_canvas).
  document.querySelectorAll('.bcc-sig-pad').forEach(function(pad){
    var canvas=pad.querySelector('.bcc-sig-canvas');
    var clearBtn=pad.querySelector('.bcc-sig-clear');
    var placeholder=pad.querySelector('.bcc-sig-placeholder');
    var dataInput=pad.parentNode.querySelector('.bcc-sig-data');
    if(!canvas||!dataInput)return;
    var ctx=canvas.getContext('2d');
    (function setup(){var w=canvas.clientWidth||300;canvas.width=w;canvas.height=180;ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#063b63';})();
    var drawing=false,hasInk=false;
    function pt(e){var r=canvas.getBoundingClientRect();var s=(e.touches&&e.touches[0])?e.touches[0]:e;return {x:s.clientX-r.left,y:s.clientY-r.top};}
    function down(e){drawing=true;var p=pt(e);ctx.beginPath();ctx.moveTo(p.x,p.y);if(placeholder)placeholder.style.display='none';pad.classList.remove('bcc-sig-error');e.preventDefault();}
    function move(e){if(!drawing)return;var p=pt(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;e.preventDefault();}
    function up(){if(!drawing)return;drawing=false;if(hasInk){dataInput.value=canvas.toDataURL('image/png');}}
    canvas.addEventListener('mousedown',down);window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
    canvas.addEventListener('touchstart',down,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',up);
    if(clearBtn)clearBtn.addEventListener('click',function(){ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;dataInput.value='';if(placeholder)placeholder.style.display='';});
  });

  // Multiple-file uploads: stage each file to the bridge as it's added; submit every
  // staged ref for the form as ONE JSON field (forminator-multifile-hidden), keyed by
  // "{element_id}_<uid>" (Forminator strips the _<uid> suffix back to the element_id).
  document.querySelectorAll('form.bcc-form').forEach(function(form){
    var rows=form.querySelectorAll('.bcc-upload-row');
    if(!rows.length)return;
    var formId=form.getAttribute('data-bcc-form-id');
    var mfh=document.createElement('input');mfh.type='hidden';mfh.name='forminator-multifile-hidden';mfh.value='';form.appendChild(mfh);
    var state={};
    function sync(){var obj={};Object.keys(state).forEach(function(eid){if(state[eid].length)obj[eid+'_bcc']=state[eid];});mfh.value=Object.keys(obj).length?JSON.stringify(obj):'';}
    Array.prototype.forEach.call(rows,function(row){
      var input=row.querySelector('.bcc-upload-input');
      var list=row.querySelector('.bcc-upload-list');
      var elementId=row.getAttribute('data-bcc-upload');
      state[elementId]=state[elementId]||[];
      if(!input)return;
      input.addEventListener('change',function(){
        Array.prototype.forEach.call(input.files,function(file){
          var li=document.createElement('li');li.className='bcc-upload-item';
          var nm=document.createElement('span');nm.className='bcc-upload-name';nm.textContent=file.name+' — uploading…';
          li.appendChild(nm);list.appendChild(li);
          var fd=new FormData();fd.append('form_id',formId);fd.append('element_id',elementId);fd.append('file',file);
          fetch('/api/forms/upload/',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(d){
            if(d&&d.success&&d.file_name){
              nm.textContent=file.name;li.classList.add('bcc-upload-ok');
              var ref={file_name:d.file_name,success:true};state[elementId].push(ref);sync();
              var rm=document.createElement('button');rm.type='button';rm.className='bcc-upload-remove';rm.setAttribute('aria-label','Remove');rm.textContent='\\u2715';
              rm.addEventListener('click',function(){var i=state[elementId].indexOf(ref);if(i>-1)state[elementId].splice(i,1);sync();list.removeChild(li);});
              li.appendChild(rm);
            } else {
              nm.textContent=file.name+' — '+((d&&d.message)||'upload failed');li.classList.add('bcc-upload-err');
            }
          }).catch(function(){nm.textContent=file.name+' — network error';li.classList.add('bcc-upload-err');});
        });
        input.value='';
      });
    });
  });

  document.querySelectorAll('form.bcc-form').forEach(function(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var msg=form.querySelector('.forminator-response-message');
      var btn=form.querySelector('.forminator-button-submit');
      // Required signature/upload aren't native required inputs, so check them here.
      var blockMsg='';
      form.querySelectorAll('.bcc-sig-pad[data-sig-required="1"]').forEach(function(p){
        var di=p.parentNode.querySelector('.bcc-sig-data');
        if(!di||!di.value){blockMsg='Please provide your signature.';p.classList.add('bcc-sig-error');}
      });
      form.querySelectorAll('.bcc-upload-row[data-upload-required="1"]').forEach(function(r){
        if(!r.querySelector('.bcc-upload-item.bcc-upload-ok')){blockMsg=blockMsg||'Please attach the required file(s).';r.classList.add('bcc-sig-error');}
      });
      if(blockMsg){if(msg){msg.className='forminator-response-message bcc-error';msg.hidden=false;msg.textContent=blockMsg;}return;}
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
