// Theme + MyGameShow branding: Halloween is the default; ?theme=neon (or BUZZWISE_THEME/MGS_THEME=neon) restores the Neon Game Show look.
const { server } = require('../server.js');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const PAGES = ['/', '/host', '/play', '/wof', '/wof/play', '/ff', '/ff/play', '/pir', '/pir/play'];
server.listen(0, async () => {
  const u = `http://localhost:${server.address().port}`;
  try {
    for (const p of PAGES) {
      const h = await (await fetch(u + p)).text();
      ok(h.includes('href="/halloween.css"') && /<body[^>]*class="[^"]*\bhalloween\b/.test(h), `${p} is Halloween by default`);
      ok(/<title>[^<]*MyGameShow[^<]*<\/title>/.test(h) && /<img class="n?mark mark-img" src="\/icons\/logo-96.png"/.test(h) && !/buzzwise/i.test(h.replace(/buzzwise\.onrender\.com/gi, '')), `${p} branded MyGameShow (title + artwork logo, no "Buzzwise")`);
      const n = await (await fetch(u + p + '?theme=neon')).text();
      ok(!n.includes('halloween.css') && !/<body[^>]*\bhalloween\b/.test(n) && n.includes('neon.css'), `${p}?theme=neon restores neon`);
    }
    const css = await fetch(u + '/halloween.css');
    ok(css.status === 200 && (css.headers.get('content-type') || '').includes('text/css'), '/halloween.css served');
    const s = await css.text();
    ok(/prefers-reduced-motion/.test(s) && !/__[A-Z]+__/.test(s), 'reduced-motion block present, no template placeholders');
    const home = await (await fetch(u + '/')).text();
    ok(/data-jp-boards>36</.test(home), 'home still shows 36 boards');
  } catch (e) { failN++; console.error(e); }
  console.log(`\nTheme tests: ${pass} passed, ${failN} failed`); server.close(); process.exit(failN ? 1 : 0);
});
