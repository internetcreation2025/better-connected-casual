import { NextRequest } from 'next/server'

// Login screen as a route handler (not a page) so it wins over the catch-all
// [[...slug]] route handler, which otherwise intercepts /login.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export async function GET(req: NextRequest) {
  const error = req.nextUrl.searchParams.get('error') === '1'
  const next = req.nextUrl.searchParams.get('next') || '/'

  const html = `<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Better Connected — Staff access</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:Poppins,sans-serif;background:linear-gradient(160deg,#06314f 0%,#0a4a73 55%,#009ec8 140%)}
  .card{width:100%;max-width:400px;background:#fff;border-radius:18px;padding:40px 36px;box-shadow:0 30px 80px rgba(0,20,40,.35)}
  h1{margin:0;font:700 24px/1.2 Poppins,sans-serif;color:#063b63}
  p.sub{margin:8px 0 28px;font:400 14px/1.5 Poppins,sans-serif;color:#5a6b7a}
  label{display:block;font:500 13px Poppins,sans-serif;color:#063b63;margin-bottom:8px}
  input[type=password]{width:100%;font:400 15px Poppins,sans-serif;color:#063b63;border:1.5px solid #d8e3ec;border-radius:10px;padding:13px 16px;outline:none}
  input[type=password]:focus{border-color:#009ec8}
  .err{margin:12px 0 0;font:500 13px Poppins,sans-serif;color:#c0392b}
  button{margin-top:22px;width:100%;font:600 15px Poppins,sans-serif;color:#fff;background:#009ec8;border:none;border-radius:10px;padding:14px;cursor:pointer}
  button:hover{background:#0089ad}
</style>
</head><body>
  <div class="card">
    <h1>Better Connected</h1>
    <p class="sub">Staff access only. Enter the access password to continue.</p>
    <form method="POST" action="/api/login/">
      <input type="hidden" name="next" value="${esc(next)}">
      <label for="pw">Password</label>
      <input id="pw" type="password" name="password" autofocus required autocomplete="current-password">
      ${error ? '<p class="err">Incorrect password. Please try again.</p>' : ''}
      <button type="submit">Enter</button>
    </form>
  </div>
</body></html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
