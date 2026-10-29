// App icons + manifest: served with the right content types, and every page links them.
const { server } = require('../server.js');
const fs = require('fs'), path = require('path');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
server.listen(0, async () => {
  const u = `http://localhost:${server.address().port}`;
  try {
    for (const [p, t] of [['/apple-touch-icon.png', 'image/png'], ['/icons/icon-192.png', 'image/png'], ['/icons/icon-512.png', 'image/png'], ['/icons/icon-maskable-512.png', 'image/png'],
      ['/favicon-32.png', 'image/png'], ['/icons/logo-96.png', 'image/png'], ['/favicon.ico', 'image/x-icon'], ['/favicon.svg', 'image/svg+xml'], ['/manifest.webmanifest', 'application/manifest+json']]) {
      const r = await fetch(u + p); ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith(t), `${p} → 200 ${t}`); }
    const png = fs.readFileSync(path.join(__dirname, '../public/apple-touch-icon.png'));
    ok(png.readUInt32BE(16) === 180 && png.readUInt32BE(20) === 180 && png[25] === 2, 'apple-touch-icon is 180x180 RGB (no alpha)');
    const m = await (await fetch(u + '/manifest.webmanifest')).json();
    ok(m.name === 'MyGameShow' && m.short_name === 'MyGameShow' && m.display === 'standalone' && m.start_url === '/' && m.icons.some(i => i.purpose === 'maskable'), 'manifest fields + maskable icon');
    const pages = fs.readdirSync(path.join(__dirname, '../public')).filter(f => f.endsWith('.html'));
    const need = ['rel="apple-touch-icon"', 'rel="manifest"', 'name="theme-color"', 'name="apple-mobile-web-app-capable"', 'name="apple-mobile-web-app-title" content="MyGameShow"', 'href="/favicon.svg"', 'href="/favicon.ico"'];
    const bad = pages.filter(f => { const s = fs.readFileSync(path.join(__dirname, '../public', f), 'utf8'); return need.some(n => !s.includes(n)); });
    ok(pages.length >= 15 && !bad.length, `all ${pages.length} pages carry icon/manifest/meta tags${bad.length ? ' — missing: ' + bad : ''}`);
  } catch (e) { failN++; console.error(e); }
  console.log(`\nIcon tests: ${pass} passed, ${failN} failed`); server.close(); process.exit(failN ? 1 : 0);
});
