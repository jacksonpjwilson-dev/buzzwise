// Family Feud face-off buzzer: first buzz wins by arrival, other locked out, rotation, timeout, control flow, both host modes.
require('./autogo');
process.env.FF_READ_MS = '1';
process.env.FF_FACEOFF_MS = '300';
const { server, ff } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/ff`;
  const mk = () => { const s = io(url, { transports: ['websocket'], forceNew: true }); s.buzzes = []; s.on('state', x => s.state = x); s.on('buzz', b => s.buzzes.push(b)); return s; };
  try {
    for (const mode of ['player', 'dedicated']) {
      console.log(`Face-off buzzer · ${mode} host`);
      const H = mk(), P = { a1: mk(), a2: mk(), b1: mk(), b2: mk() }; const { code } = await call(H, 'host:create', {});
      H.emit('host:mode', { mode });
      for (const [pid, s] of Object.entries(P)) await call(s, 'player:join', { code, name: pid.toUpperCase(), pid, team: pid[0] === 'a' ? 0 : 1 });
      let hostPid = null;
      if (mode === 'player') { await call(H, 'host:joinTeam', { name: 'Hosty', team: 0 }); hostPid = 'host-' + code; }
      const room = ff.rooms[code]; const ans = () => room.round.survey.answers;
      H.emit('host:startRound'); await wait(60);
      const fo = H.state.round.faceoff; ok(H.state.phase === 'faceoff' && fo[0] && fo[1] && room.players[fo[0]].team === 0 && room.players[fo[1]].team === 1, 'one face-off player per team, shown on shared screen');
      const sock = id => P[id];
      // both buzz "at once": first to arrive wins
      const s0 = sock(fo[0]), s1 = sock(fo[1]);
      let r0, r1;
      if (s0 && s1) { const p0 = call(s1, 'player:buzz', {}); const p1 = call(s0, 'player:buzz', {}); [r1, r0] = await Promise.all([p0, p1]); await wait(50);
        ok(H.state.round.buzzed === fo[1] && r1.ok && r0.error, 'first buzz (by arrival) wins; second is locked out');
        ok(H.buzzes.length === 1 && H.buzzes[0].pid === fo[1], 'shared screen gets one buzz event (sound) for the winner');
        ok((await call(s0, 'player:buzz', {})).error && H.state.round.buzzed === fo[1], 'locked-out player cannot steal the buzz');
        // non-#1 answer -> other gets a chance; better answer wins control
        await call(s1, 'player:guess', { text: ans()[2].text }); await wait(40);
        ok(H.state.round.buzzed === fo[0] && H.state.phase === 'faceoff', 'not #1: other face-off player gets a chance');
        await call(s0, 'player:guess', { text: ans()[0].text }); await wait(40);
        ok(H.state.phase === 'playpass' && H.state.round.control === 0, 'higher answer wins control for that team');
      } else { // host player is in the face-off (player-host mode)
        await call(H, 'host:buzzFor', { pid: fo[0] }); const late = await call(s1, 'player:buzz', {}); await wait(40);
        ok(H.state.round.buzzed === fo[0] && late.error, 'host player buzzes first from the host screen; phone locked out');
        await call(H, 'host:guess', { text: 'zzqx not an answer' }); await wait(40);
        ok(H.state.round.buzzed === fo[1], 'wrong answer passes to the opponent');
        await call(s1, 'player:guess', { text: ans()[3].text }); await wait(40);
        ok(H.state.phase === 'playpass' && H.state.round.control === 1, 'only on-board answer wins control');
      }
      const ctl = H.state.round.control, chooser = Object.entries(P).find(([id]) => room.players[id].team === ctl)[1];
      chooser.emit('player:playPass', { choice: 'pass' }); await wait(40);
      ok(H.state.phase === 'play' && H.state.round.control === 1 - ctl, 'winning team chooses pass -> other team plays');
      H.emit('host:skipRound'); await wait(40); H.emit('host:startRound'); await wait(60);
      const fo2 = H.state.round.faceoff; ok(fo2[0] !== fo[0] && fo2[1] !== fo[1], `rotation: new face-off players (${fo2.join(' vs ')})`);
      // timeout passes to opponent
      const t0 = sock(fo2[0]) || null; if (t0) await call(t0, 'player:buzz', {}); else await call(H, 'host:buzzFor', { pid: fo2[0] }); await wait(30);
      ok(H.state.round.foEndsAt > 0, 'answer clock shown after buzz');
      await wait(400); ok(H.state.round.buzzed === fo2[1] && H.state.round.faceoffAnswers[0].rank === -1, 'timeout counts as a miss and passes to the opponent');
      if (mode === 'player') { H.emit('host:skipRound'); await wait(30); H.emit('host:startRound'); await wait(50);
        const seen = new Set([...fo, ...fo2, ...H.state.round.faceoff].filter(x => room.players[x].team === 0)); ok(seen.has(hostPid) && seen.size === 3, 'rotation covers every Team 1 member including the host player'); }
      ok(!H.state.hostAnswers === (mode === 'player'), `${mode} mode: host answer list ${mode === 'player' ? 'hidden' : 'shown'}`);
      [H, ...Object.values(P)].forEach(s => s.disconnect());
    }
  } catch (e) { failN++; console.log('  ✗ crashed:', e); }
  console.log(`\nFace-off buzzer tests: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
