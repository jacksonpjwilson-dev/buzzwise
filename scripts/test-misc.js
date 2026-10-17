// Version label, /api/exists, Feud live lobby list, and "no auto-rejoin" rules on every /play page.
const fs = require('fs'), path = require('path');
const { server, rooms, ff, VERSION } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  try {
    const pkg = require('../package.json');
    const v = await (await fetch(base + '/version')).json();
    ok(v.version === pkg.version && /^v\d+\.\d+\.\d+ · \w+$/.test(v.label) && v.label === VERSION.label, `/version serves ${v.label}`);
    if (process.env.RENDER_GIT_COMMIT) ok(v.commit === process.env.RENDER_GIT_COMMIT.slice(0, 7), 'commit comes from RENDER_GIT_COMMIT');
    const pub = path.join(__dirname, '..', 'public');
    const htmls = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
    ok(htmls.length >= 9 && htmls.every(f => fs.readFileSync(path.join(pub, f), 'utf8').includes('/version.js')), `version label on all ${htmls.length} pages`);
    for (const f of ['play.js', 'ff-play.js', 'wof-play.js', 'pir-play.js']) {
      const s = fs.readFileSync(path.join(pub, f), 'utf8'), con = s.split('\n').find(l => l.includes("socket.on('connect'"));
      ok(/qcode && qcode\.toUpperCase\(\) === saved\.code/.test(con) && /joined/.test(con) && !/!qcode \|\|/.test(con), `${f}: only auto-rejoins on reconnect or when the URL has that code`);
      ok(s.includes('BWJ.rejoinHtml') && s.includes('BWJ.verify') && s.includes('BWJ.isStale') && !s.includes("value=\"${esc(qcode || (saved"), `${f}: enter-code screen with Rejoin button; stale sessions cleared`);
    }
    // /api/exists
    const h = io(base, { transports: ['websocket'], forceNew: true }); const { code } = await call(h, 'host:create', {});
    const ex = async (g, c) => (await (await fetch(`${base}/api/exists?game=${g}&code=${c}`)).json()).exists;
    ok(await ex('jp', code) && await ex('jp', code.toLowerCase()) && !(await ex('jp', 'ZZZZZ')) && !(await ex('ff', code)), '/api/exists reports live vs gone games per mode');
    // Feud lobby list updates live
    const fu = base + '/ff', H = io(fu, { transports: ['websocket'], forceNew: true }); let st; H.on('state', x => st = x);
    const fr = await call(H, 'host:create', {});
    const p1 = io(fu, { transports: ['websocket'], forceNew: true }), p2 = io(fu, { transports: ['websocket'], forceNew: true });
    await call(p1, 'player:join', { code: fr.code, name: 'Ann', pid: 'l1', team: 0 }); await wait(40);
    ok(st.players.length === 1 && st.players[0].name === 'Ann' && st.players[0].team === 0, 'Feud host lobby sees Ann join (Team 1)');
    await call(p2, 'player:join', { code: fr.code, name: 'Bob', pid: 'l2', team: 1 }); await wait(40);
    ok(st.players.map(p => p.name + p.team).sort().join() === 'Ann0,Bob1', 'Bob appears under Team 2');
    p1.disconnect(); await wait(80);
    ok(st.players.length === 1 && st.players[0].name === 'Bob', 'leaving in the lobby removes the player from the host list');
    ok(await ex('ff', fr.code), 'Feud game exists while hosted');
  } catch (e) { failN++; console.log('  ✗ crashed:', e); }
  console.log(`\nMisc tests: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
