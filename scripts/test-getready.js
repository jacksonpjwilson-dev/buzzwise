// 'Get ready' gate in the original modes (nothing question-like or spoken before Start) + Family Feud face-off read-aloud.
process.env.FF_READ_MS = '400'; process.env.FF_FACEOFF_MS = '5000';
const { server, rooms, ff, wof, pir } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d || {}, r));
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const mk = ns => { const s = io(base + ns, { transports: ['websocket'], forceNew: true }); s.all = []; s.on('state', x => { s.state = x; s.all.push(JSON.stringify(x)); }); return s; };
  const has = (s, t) => s.all.some(x => x.includes(JSON.stringify(t).slice(1, -1)));
  try {
    console.log('Jeopardy');
    { const H = mk(''), A = mk(''); const { code } = await call(H, 'host:create', {}); await call(A, 'player:join', { code, name: 'Ann', pid: 'ja' });
      H.emit('host:mode', { mode: 'player' }); H.emit('host:selectBoard', { boardId: 'jackpot' }); H.emit('host:start'); await wait(60);
      ok(H.state.phase === 'getready' && A.state.phase === 'getready' && !H.state.grid && !A.state.grid, 'game start: Get ready on shared screen + phones (no board yet)');
      ok(H.state.getReady.lines.length > 0 && H.state.scores.length === 1, 'shows who\'s up and the scores');
      H.emit('host:open', { c: 0, r: 0 }); await wait(40); ok(!rooms[code].current && !H.all.some(x => x.includes('"speak"')), 'cannot open a clue (no speech) before Start');
      await call(H, 'host:go'); await wait(40); ok(H.state.phase === 'board' && H.state.grid, 'Start shows the board');
      for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++) rooms[code].used.add(`0-${c}-${r}`); H.emit('host:nextRound'); await wait(40);
      ok(H.state.phase === 'getready' && /Double/.test(H.state.getReady.title), 'Double Jeopardy round begins with Get ready');
      await call(H, 'host:go'); await wait(30); H.emit('host:open', { c: 0, r: 0 }); await wait(40); ok(H.state.phase !== 'getready', 'no Get ready before individual clues');
      [H, A].forEach(s => s.disconnect()); }
    console.log('Family Feud · get ready + read-aloud');
    { const H = mk('/ff'), A = mk('/ff'), B = mk('/ff'); const { code } = await call(H, 'host:create', {});
      await call(A, 'player:join', { code, name: 'Ann', pid: 'fa', team: 0 }); await call(B, 'player:join', { code, name: 'Bob', pid: 'fb', team: 1 });
      H.emit('host:startRound'); await wait(50); const room = ff.rooms[code], q = room.round.survey.q;
      ok(H.state.phase === 'getready' && /Ann.*vs.*Bob/.test(H.state.getReady.lines[0]), 'face-off Get ready shows the pair');
      ok(!has(H, q) && !has(A, q) && !H.all.some(x => x.includes('"speak"')), 'no question text or speech before Start');
      ok((await call(A, 'player:buzz')).error, 'buzzers locked before Start');
      await call(H, 'host:go'); await wait(40);
      ok(H.state.speak === q && H.state.round.reading && H.state.round.question === null && !has(A, q), 'Start: shared screen gets text only to speak; hidden from screen + phones');
      ok(A.state.round.reading, 'buzzers open while reading');
      const seq = H.state.round.readSeq; await call(A, 'player:buzz'); await wait(40);
      ok(H.state.round.buzzed === 'fa' && !H.state.round.reading && !H.state.speak, 'a buzz cuts the reading off');
      H.emit('host:readDone', { seq }); await wait(30); ok(!H.state.round.fullyRead && H.state.round.question === null && !has(B, q), 'interrupted reading does not show the question');
      await call(A, 'player:guess', { text: 'zzqx nothing' }); await wait(40);
      ok(H.state.round.buzzed === 'fb' && !H.state.round.reading && H.state.round.readSeq === seq, 'pass to the opponent is NOT re-read');
      H.emit('host:reread'); await wait(30); ok(!H.state.round.reading, 'no re-read while a player is answering');
      [H, A, B].forEach(s => s.disconnect()); }
    { const H = mk('/ff'), A = mk('/ff'), B = mk('/ff'); const { code } = await call(H, 'host:create', {});
      await call(A, 'player:join', { code, name: 'Ann', pid: 'ga', team: 0 }); await call(B, 'player:join', { code, name: 'Bob', pid: 'gb', team: 1 });
      H.emit('host:startRound'); await wait(30); await call(H, 'host:go'); const q = ff.rooms[code].round.survey.q; await wait(30);
      H.emit('host:readDone', { seq: H.state.round.readSeq }); await wait(40);
      ok(H.state.round.fullyRead && H.state.round.question === q && A.state.round.question === q, 'after one full reading the question shows on screen + phones');
      [H, A, B].forEach(s => s.disconnect()); }
    { const H = mk('/ff'), A = mk('/ff'), B = mk('/ff'); const { code } = await call(H, 'host:create', {});
      await call(A, 'player:join', { code, name: 'Ann', pid: 'ha', team: 0 }); await call(B, 'player:join', { code, name: 'Bob', pid: 'hb', team: 1 });
      H.emit('host:startRound'); await wait(30); await call(H, 'host:go'); await wait(500);
      ok(H.state.round.fullyRead && H.state.round.question, 'fallback timer completes the reading when speech events never fire');
      [H, A, B].forEach(s => s.disconnect()); }
    console.log('Wheel of Fortune');
    { const H = mk('/wof'), A = mk('/wof'); const { code } = await call(H, 'host:create', {}); await call(A, 'player:join', { code, name: 'Ann', pid: 'wa' });
      H.emit('host:mode', { mode: 'player' }); H.emit('host:next', { type: 'tossup' }); await wait(200); const room = wof.rooms[code];
      ok(H.state.phase === 'getready' && !H.state.board && !A.state.board && !A.state.category && !room.revealTimer, 'toss-up: no puzzle, category or tile reveals before Start');
      ok(!has(H, room.puzzle.text) && !has(A, room.puzzle.text), 'puzzle text never sent before Start');
      await call(H, 'host:go'); await wait(60); ok(A.state.phase === 'tossup' && A.state.board, 'Start shows the puzzle board');
      [H, A].forEach(s => s.disconnect()); }
    console.log('Price Is Right');
    { const H = mk('/pir'), A = mk('/pir'), B = mk('/pir'); const { code } = await call(H, 'host:create', {});
      await call(A, 'player:join', { code, name: 'Ann', pid: 'pa' }); await call(B, 'player:join', { code, name: 'Bob', pid: 'pb' });
      await call(H, 'host:row'); await wait(40); const item = pir.rooms[code].row.item.name;
      ok(H.state.phase === 'getready' && !has(H, item) && !has(A, item), "Contestants' Row: item hidden before Start");
      ok((await call(A, 'player:bid', { amount: 5 })).error, 'no bidding before Start');
      await call(H, 'host:go'); await wait(30); ok(A.state.row && A.state.row.item.name === item, 'Start reveals the item');
      [H, A, B].forEach(s => s.disconnect()); }
  } catch (e) { failN++; console.log('  ✗ crashed:', e); }
  console.log(`\nGet-ready tests: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
