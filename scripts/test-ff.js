// Family Feud flow test: answers never leak before reveal; matching, strikes, steal, override, Fast Money.
require('./autogo');
process.env.FF_READ_MS = process.env.FF_READ_MS || '1';
process.env.FF_FM1 = '2'; process.env.FF_FM2 = '2';
const { server, ff } = require('../server.js');
const { io } = require('socket.io-client');
const { match } = require('../ff.js');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
const SURV = ff.SURVEYS; const findS = q => SURV.find(s => s.q.includes(q));

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/ff`;
  const all = []; // every state message every client received, with the round's survey at that moment
  const mk = n => { const s = io(url, { transports: ['websocket'], forceNew: true }); s.errors = []; s.on('state', x => { s.state = x; all.push({ who: n, x, raw: JSON.stringify(x) }); }); s.on('errorMsg', e => s.errors.push(e)); s.strikes = 0; s.on('strike', () => s.strikes++); return s; };
  try {
    // --- pure matcher checks ---
    const beach = findS('bring to the beach').answers, pets = findS('lives in a cage').answers;
    const m = (g, a) => { const i = match(g, a); return i >= 0 ? a[i].text : null; };
    ok(m('Towels', beach) === 'Towel' && m('TOWEL!', beach) === 'Towel', 'case/plural/punctuation tolerant');
    ok(m('sunblock', beach) === 'Sunscreen' && m('suntan lotion', beach) === 'Sunscreen', 'aliases match');
    ok(m('sunscren', beach) === 'Sunscreen' && m('a big beach umbrela', beach) === 'Umbrella', 'typo tolerant');
    ok(m('parakeets', pets) === 'Bird' && m('pizza', beach) === null && m('beach', beach) === null, 'non-answers and ambiguous words do not match');

    const host = mk('host'), a1 = mk('a1'), a2 = mk('a2'), b1 = mk('b1'), b2 = mk('b2');
    const { code } = await call(host, 'host:create', {});
    await call(a1, 'player:join', { code, name: 'Amy', pid: 'a1', team: 0 }); await call(a2, 'player:join', { code, name: 'Al', pid: 'a2', team: 0 });
    await call(b1, 'player:join', { code, name: 'Bo', pid: 'b1', team: 1 }); await call(b2, 'player:join', { code, name: 'Bea', pid: 'b2', team: 1 });
    await wait(60); ok(host.state.players.length === 4 && host.state.players.filter(p => p.team === 1).length === 2, 'two teams of two');
    const room = ff.rooms[code];
    // force known survey for round 1
    room.usedQ = new Set(SURV.map((_, i) => i).filter(i => SURV[i] !== findS('bring to the beach')));
    host.emit('host:startRound'); await wait(60);
    ok(host.state.phase === 'faceoff' && host.state.round.question.includes('beach'), 'round 1 face-off with question shown');
    ok(host.state.round.board.every(x => !x.text && !x.points), 'host board has NO hidden answer text/points');
    const fo = host.state.round.faceoff; const A = fo[0] === 'a1' ? a1 : a2, B = fo[1] === 'b1' ? b1 : b2;
    B.emit('player:buzz'); A.emit('player:buzz'); await wait(60); ok(host.state.round.buzzed === fo[1], 'first buzz wins face-off');
    await call(B, 'player:guess', { text: 'sun block' }); await wait(40); // #2 Sunscreen
    ok(host.state.round.board[1].text === 'Sunscreen' && host.state.round.buzzed === fo[0], 'face-off answer #2 revealed; other player gets a shot');
    await call(A, 'player:guess', { text: 'towels' }); await wait(40);
    ok(host.state.phase === 'playpass' && host.state.round.control === 0, 'higher-ranked answer (#1) wins control');
    a1.emit('player:playPass', { choice: 'play' }); await wait(40); ok(host.state.phase === 'play' && host.state.round.control === 0, 'team chooses play');
    await call(b1, 'player:guess', { text: 'cooler' }).then(r => ok(r.error, 'other team cannot answer during play'));
    await call(host, 'host:guess', { text: 'beach umbrella' }); await wait(40); ok(host.state.round.board[2].text === 'Umbrella', 'host-typed answer matched & revealed');
    await call(host, 'host:guess', { text: 'towel' }); await wait(40); ok(host.state.round.strikes === 0 && /already/.test(host.state.message), 'repeat answer is not a strike');
    await call(a2, 'player:guess', { text: 'pizza' }); await wait(60); ok(host.state.round.strikes === 1 && host.strikes >= 1 && a1.strikes >= 1, 'miss = strike broadcast (X + sound)');
    ok(host.state.round.canOverride, 'override offered after a miss (without revealing anything)');
    await call(a2, 'player:guess', { text: 'ice chest' }); await wait(40); ok(host.state.round.board[3].text === 'Cooler', 'alias "ice chest" -> Cooler');
    // override: "beech chairz" is a miss, host says it should count -> reveals closest (Chair)
    await call(a2, 'player:guess', { text: 'folding seat' }); await wait(40); ok(host.state.round.strikes === 2, 'second strike');
    room.round.lastMiss.text = 'lawn chairs please'; // simulate a near-miss phrasing
    await call(host, 'host:override', {}); await wait(40); ok(host.state.round.strikes === 1 && host.state.round.board[4].text === 'Chair', 'override removes strike and reveals best candidate on confirm');
    await call(a1, 'player:guess', { text: 'hot dog' }); await call(a1, 'player:guess', { text: 'bicycle' }); await wait(40);
    ok(host.state.phase === 'steal' && host.state.round.strikes === 3, 'three strikes -> steal');
    const potBefore = host.state.round.pot;
    await call(a1, 'player:guess', { text: 'shades' }).then(r => ok(r.error, 'playing team cannot answer the steal'));
    await call(b2, 'player:guess', { text: 'shades' }); await wait(60);
    ok(host.state.phase === 'roundEnd' && host.state.teams[1].score === potBefore + 7 && host.state.round.winner === 1, `steal succeeds: Team 2 wins ${potBefore + 7}`);
    ok(host.state.round.board.every(x => x.text), 'after round end all answers are revealed');
    // round 2: failed steal
    host.emit('host:startRound'); await wait(60); const r2 = room.round; ok(r2.num === 2 && r2.mult === 1, 'round 2 starts');
    const fo2 = host.state.round.faceoff; const s2 = { a1, a2, b1, b2 };
    s2[fo2[0]].emit('player:buzz'); await wait(30); await call(s2[fo2[0]], 'player:guess', { text: r2.survey.answers[0].aliases[0] }); await wait(40);
    ok(host.state.phase === 'playpass' && host.state.round.control === 0, '#1 answer in face-off wins control immediately');
    host.emit('host:playPass', { choice: 'pass' }); await wait(40); ok(host.state.round.control === 1, 'pass gives control to the other team');
    for (const g of ['zzqx', 'qqqq', 'xxyy']) await call(host, 'host:guess', { text: g }); await wait(40);
    ok(host.state.phase === 'steal', '3 strikes');
    const t0 = host.state.teams[0].score, t1 = host.state.teams[1].score, pot2 = host.state.round.pot;
    await call(a1, 'player:guess', { text: 'nothing like it' }); await wait(40);
    ok(host.state.teams[1].score === t1 + pot2 && host.state.teams[0].score === t0, 'failed steal: controlling team banks pot');
    // multipliers
    host.emit('host:startRound'); await wait(40); ok(host.state.round.mult === 2, 'round 3 is double');
    host.emit('host:skipRound'); await wait(30); host.emit('host:startRound'); await wait(40); ok(host.state.round.mult === 3, 'round 4 is triple');
    // leak audit (before Fast Money)
    let leaks = 0;
    for (const { x } of all) { if (!x.round || !x.round.question) continue; const sv = SURV.find(s => s.q === x.round.question);
      x.round.board.forEach((b, i) => { if (!b.text) { const t = sv.answers[i].text; const raw = JSON.stringify(x); if (raw.includes(`"${t}"`) || b.points !== undefined) leaks++; } }); }
    ok(all.length > 60 && leaks === 0, `no unrevealed answer in any of ${all.length} messages to host or players`);
    // Fast Money
    host.emit('host:skipRound'); await wait(30);
    room.usedQ = new Set(SURV.map((_, i) => i).filter(i => ![findS('sold by the dozen'), findS('sound a dog makes'), findS('rhymes with "cat"'), findS('famous ship'), findS('snack people eat at the movies')].includes(SURV[i])));
    host.emit('host:fastMoney', { p1: 'a1', p2: 'a2' }); await wait(40); ok(host.state.phase === 'fm' && host.state.fm.questions.length === 5, 'Fast Money: 5 questions');
    const qs = room.fm.qs, top = qi => qs[qi].answers[0].aliases[0];
    host.emit('host:fmGo'); await wait(40); ok(host.state.fm.endsAt - Date.now() > 1000, 'player 1 timer running');
    await call(a2, 'player:fmAnswer', { text: 'x' }).then(r => ok(r.error, 'only the active Fast Money player can answer'));
    for (let q = 0; q < 5; q++) await call(a1, 'player:fmAnswer', { text: top(q) }); await wait(40);
    ok(host.state.fm.stage === 'ready2' && host.state.fm.total === qs.reduce((s, x) => s + x.answers[0].points, 0), `player 1 matched all top answers: ${host.state.fm.total}`);
    ok(!JSON.stringify(a2.state.fm).includes(qs[0].answers[1].text), 'unmatched Fast Money answers not sent');
    host.emit('host:fmGo'); await wait(40);
    ok(a2.state.fm.rows.every(r => r[0] && r[0].submitted && !r[0].guess), "player 1's answers hidden during player 2's turn");
    const dup = await call(a2, 'player:fmAnswer', { text: top(0) }); ok(dup.duplicate && host.state.fm.dup, 'duplicate answer -> try again');
    await call(a2, 'player:fmAnswer', { text: qs[0].answers[1].aliases[0] }); await call(a2, 'player:fmAnswer', { pass: true });
    await wait(2200); ok(host.state.phase === 'fmDone' && host.state.fm.total >= 200, `timer expiry ends turn; total ${host.state.fm.total} >= 200 = win`);
    ok(host.state.message.includes('WIN'), 'Fast Money win announced');
  } catch (e) { failN++; console.error(e); }
  console.log(`\nFeud: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
