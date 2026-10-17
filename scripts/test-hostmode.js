// Host-toggle tests: Jeopardy player-host flow (answer never leaks before Correct, wrong reopens buzzers,
// timeout reveals), dedicated-host secrets for FF/PIR/WoF, and Family Feud synonym/typo judging.
process.env.JP_READ_MS = '300'; process.env.JP_BUZZ_MS = '600';
const { server, rooms } = require('../server.js');
const { io } = require('socket.io-client');
const { match, loadSurveys } = require('../ff.js');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
function client(url) { const s = io(url, { transports: ['websocket'], forceNew: true }); s.all = []; s.errors = []; s.on('state', st => { s.state = st; s.all.push(JSON.stringify(st)); }); s.on('errorMsg', e => s.errors.push(e)); return s; }
const has = (s, ans) => s.all.some(x => x.toLowerCase().includes(ans.toLowerCase()));

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  try {
    console.log('Jeopardy · player host');
    const host = client(base), a = client(base), b = client(base), c = client(base);
    const { code } = await call(host, 'host:create', {});
    for (const [s, n] of [[a, 'Ann'], [b, 'Ben'], [c, 'Cat']]) await call(s, 'player:join', { code, name: n, pid: 'p' + n });
    host.emit('host:mode', { mode: 'player' }); host.emit('host:selectBoard', { boardId: 'pub-quiz-night' }); host.emit('host:start'); await wait(120);
    ok(host.state.hostMode === 'player', 'host toggle switched to player-host mode');
    const room = rooms[code]; let [ddc, ddr] = [...room.dd][0].split('-').map(Number); let oc = ddc === 0 && ddr === 2 ? 1 : 0;
    const clue = room.board.rounds[0][oc].clues[2], ANS = clue.a;
    [host, a, b, c].forEach(s => s.all = []);
    host.emit('host:open', { c: oc, r: 2 }); await wait(60);
    ok(host.state.current.reading && a.state.current.buzzOpen, 'clue is being read aloud; buzzers OPEN while reading');
    ok(host.state.current.speak === clue.q && host.state.current.clue === null, 'host screen gets text only to speak; clue text hidden until a full read');
    ok(!has(a, clue.q) && !has(b, clue.q), 'clue text never sent to phones');
    const seq1 = host.state.current.readSeq;
    a.emit('player:buzz'); await wait(80);
    ok(host.state.current.buzzed === 'pAnn' && !host.state.current.reading, 'mid-read buzz accepted and stops the reading (speech cancelled)');
    host.emit('host:readDone', { seq: seq1 }); await wait(40);
    ok(!host.state.current.fullyRead && host.state.current.clue === null, 'interrupted reading does NOT show the clue text');
    ok((await call(b, 'player:selfJudge', { correct: true })).error, 'other players cannot judge');
    ok((await call(a, 'player:selfJudge', { correct: true })).error, 'must wait for host reveal before judging');
    ok((await call(a, 'player:reveal', {})).error && !a.state.current.peeked, 'buzzing player cannot reveal the answer to themselves');
    ok((await call(b, 'host:reveal', {})).error, 'a player socket cannot use the host Reveal');
    await wait(40); ok(!has(a, ANS), 'no answer on buzzing phone before host Reveal');
    ok(host.state.current.buzzed === 'pAnn' && !host.state.current.peeked, 'host screen shows Reveal pending for Ann');
    await call(host, 'host:reveal', {}); await wait(80);
    ok(a.state.current.answer === ANS, 'host Reveal sends the answer to the buzzing phone');
    ok(!has(b, ANS) && !has(c, ANS) && !has(host, ANS), 'answer NOT on host screen or other phones after host Reveal');
    await call(a, 'player:selfJudge', { correct: false }); await wait(80);
    ok(a.state.me.score === -600, 'Wrong deducts the value');
    ok(b.state.current.buzzOpen && a.state.current.lockedOut && !a.state.current.answer, 'Wrong reopens buzzers for others; Ann locked out');
    ok(host.state.current.reading && host.state.current.readSeq === seq1 + 1 && host.state.current.speak === clue.q, 'Wrong restarts the reading from the start');
    ok(host.state.current.clue === null, 'clue text still hidden during the re-read');
    host.emit('host:readDone', { seq: seq1 }); await wait(40); ok(host.state.current.reading, 'stale readDone from the interrupted read is ignored');
    host.emit('host:readDone', { seq: seq1 + 1 }); await wait(60);
    ok(host.state.current.fullyRead && host.state.current.clue && host.state.current.clue.q === clue.q && !host.state.current.clue.a, 'after one complete read the clue text shows on the shared screen (answer still hidden)');
    ok(!has(b, clue.q) && !has(c, clue.q), 'phones still never get the clue text');
    ok(!has(b, ANS) && !has(c, ANS) && !has(host, ANS), 'answer still hidden from everyone else after Wrong');
    b.emit('player:buzz'); await wait(60); await call(host, 'host:reveal', {}); await wait(40);
    ok(!has(c, ANS) && !has(host, ANS), 'still hidden before Correct');
    ok(!has(host, ANS) && !host.all.some(x => JSON.parse(x).current && JSON.parse(x).current.clue && JSON.parse(x).current.clue.a), 'host screen never received the answer in any message before Correct');
    await call(b, 'player:selfJudge', { correct: true }); await wait(80);
    ok(b.state.me.score === 600 && host.state.controller === 'pBen', 'Correct awards points and control');
    ok(host.state.current.revealed && host.state.current.clue.a === ANS && c.state.current.answer === ANS, 'Correct reveals answer on shared screen + phones');
    host.emit('host:close'); await wait(60); ok(host.state.current === null && host.state.phase === 'board', 'Continue closes the clue');
    // timeout
    let tc = oc, tr = 3; if (ddc === tc && ddr === tr) tc = oc + 1;
    const A2 = room.board.rounds[0][tc].clues[tr].a; [host, a, b, c].forEach(s => s.all = []);
    host.emit('host:open', { c: tc, r: tr }); await wait(450);
    ok(a.state.current.buzzOpen && !has(host, A2), 'reading auto-finishes (fallback timer) and buzzers open');
    await wait(750);
    ok(host.state.current.revealed && host.state.current.clue.a === A2 && host.state.current.result.why === 'timeout', 'time runs out -> answer revealed on shared screen');
    host.emit('host:close'); await wait(50);
    // nobody: everyone wrong
    let nc = oc, nr = 4; if (ddc === nc && ddr === nr) nc = oc + 1; const A3 = room.board.rounds[0][nc].clues[nr].a;
    host.emit('host:open', { c: nc, r: nr }); await wait(40); host.emit('host:readDone'); await wait(40);
    for (const s of [a, b, c]) { s.emit('player:buzz'); await wait(40); await call(host, 'host:reveal', {}); await call(s, 'player:selfJudge', { correct: false }); await wait(40); }
    ok(host.state.current.revealed && host.state.current.clue.a === A3, 'all players wrong -> answer revealed on shared screen');
    host.emit('host:close'); await wait(50);
    // Daily Double in player mode
    room.controller = 'pCat'; host.emit('host:open', { c: ddc, r: ddr }); await wait(50);
    await call(c, 'player:ddWager', { amount: 500 }); await wait(50);
    ok(host.state.current.reading && host.state.current.buzzed === 'pCat', 'Daily Double: wager then clue read aloud');
    host.emit('host:readDone'); await wait(40); await call(host, 'host:reveal', {}); await wait(40);
    const cs = c.state.me.score; await call(c, 'player:selfJudge', { correct: true }); await wait(50);
    ok(c.state.me.score === cs + 500 && host.state.current.revealed, 'Daily Double self-judged correct: +wager, revealed');
    host.emit('host:close'); await wait(40);
    ok((await new Promise(r => { host.errors = []; host.emit('host:mode', { mode: 'dedicated' }); setTimeout(() => r(host.errors.length), 60); })) === 1, 'host mode locked once game started');

    console.log('Jeopardy · dedicated host (unchanged)');
    const h2 = client(base), d = client(base); const r2 = await call(h2, 'host:create', {}); await call(d, 'player:join', { code: r2.code, name: 'Dee', pid: 'pDee' });
    h2.emit('host:selectBoard', { boardId: 'pub-quiz-night' }); h2.emit('host:start'); await wait(80);
    const rm2 = rooms[r2.code]; const [d2c, d2r] = [...rm2.dd][0].split('-').map(Number); const c2 = d2c === 0 && d2r === 0 ? 1 : 0;
    h2.emit('host:open', { c: c2, r: 0 }); await wait(60);
    ok(h2.state.hostMode === 'dedicated' && h2.state.current.clue.a && d.state.current.buzzOpen && !d.state.current.answer, 'dedicated: host sees clue+answer, buzzers instant, phone gets nothing');

    console.log('Family Feud · typed guesses + dedicated host');
    const S = loadSurveys(), find = q => S.find(s => s.q.includes(q)).answers, m = (g, A) => { const i = match(g, A); return i >= 0 ? A[i].text : null; };
    const beach = find('bring to the beach'), cage = find('lives in a cage'), kitchen = S.find(s => s.answers.some(a => a.text === 'Refrigerator')).answers, wake = find('right after waking up');
    ok(m('sun block', beach) === 'Sunscreen' && m('shades', beach) === 'Sunglasses', 'synonyms: sun block -> Sunscreen, shades -> Sunglasses');
    ok(m('fridge', kitchen) === 'Refrigerator', 'generated alias: fridge -> Refrigerator');
    ok(m('bunnies', cage) === 'Rabbit' && m('towels', beach) === 'Towel', 'plurals/stemming: bunnies -> Rabbit, towels -> Towel');
    ok(m('brushing my teeth', wake) === 'Brush Teeth' && m('showering', wake) === 'Shower', 'verb forms: brushing my teeth, showering');
    ok(m('sunscrean', beach) === 'Sunscreen' && m('hamstr', cage) === 'Hamster' && m('umbrela', beach) === 'Umbrella', 'typos: sunscrean, hamstr, umbrela');
    ok(m('pizza', beach) === null && m('laptop', beach) === null, 'unrelated guesses rejected');
    const fh = client(base + '/ff'), fp = client(base + '/ff'), fq = client(base + '/ff'); const fr = await call(fh, 'host:create', {});
    await call(fp, 'player:join', { code: fr.code, name: 'Fay', pid: 'fFay', team: 0 }); await call(fq, 'player:join', { code: fr.code, name: 'Gus', pid: 'fGus', team: 1 });
    fh.emit('host:mode', { mode: 'dedicated' }); fh.emit('host:startRound'); await wait(100);
    ok(fh.state.hostMode === 'dedicated' && fh.state.hostAnswers && fh.state.hostAnswers.length >= 5, 'FF dedicated host sees the full survey board');
    const secret = fh.state.hostAnswers[fh.state.hostAnswers.length - 1].text;
    ok(!fp.state.hostAnswers && !fp.all.some(x => x.includes('"' + secret + '"')), 'FF players never receive hidden answers');
    fh.emit('host:mode', { mode: 'player' }); await wait(60); ok(!fh.state.hostAnswers, 'FF player-host mode hides answers from host');

    console.log('Price Is Right / Wheel of Fortune · host toggle');
    const ph = client(base + '/pir'), pp = [client(base + '/pir'), client(base + '/pir')]; const pr = await call(ph, 'host:create', {});
    await call(pp[0], 'player:join', { code: pr.code, name: 'P1', pid: 'q1' }); await call(pp[1], 'player:join', { code: pr.code, name: 'P2', pid: 'q2' });
    ph.emit('host:mode', { mode: 'dedicated' }); await call(ph, 'host:row', {}); await wait(80);
    ok(ph.state.hostSecrets && ph.state.hostSecrets[0].price > 0 && !pp[0].state.hostSecrets && pp[0].state.row.item.price === undefined, 'PIR dedicated: host sees price, players do not');
    ph.emit('host:mode', { mode: 'player' }); await wait(60); ok(!ph.state.hostSecrets, 'PIR player-host: prices hidden from host');
    const wh = client(base + '/wof'), wp = [client(base + '/wof'), client(base + '/wof')]; const wr = await call(wh, 'host:create', {});
    await call(wp[0], 'player:join', { code: wr.code, name: 'W1', pid: 'w1' }); await call(wp[1], 'player:join', { code: wr.code, name: 'W2', pid: 'w2' });
    wh.emit('host:mode', { mode: 'player' }); wh.emit('host:next', { type: 'round' }); await wait(80);
    ok(wh.state.hostMode === 'player' && !wh.state.answer && !wp[0].state.answer, 'WoF player-host: puzzle answer hidden from host screen');
    wh.emit('host:mode', { mode: 'dedicated' }); await wait(60); ok(wh.errors.length === 1, 'WoF mode cannot change mid-puzzle');
    console.log('Family Feud · host plays on a team');
    { const H = client(base + '/ff'), X = client(base + '/ff'), Y = client(base + '/ff'); const hr = await call(H, 'host:create', {});
      H.emit('host:mode', { mode: 'player' });
      await call(X, 'player:join', { code: hr.code, name: 'Xia', pid: 'x1', team: 1 }); await call(Y, 'player:join', { code: hr.code, name: 'Yan', pid: 'y1', team: 1 });
      const j = await call(H, 'host:joinTeam', { name: 'Hosty', team: 0 }); await wait(50);
      const hp = H.state.players.find(p => p.isHost);
      ok(j.ok && hp && hp.name === 'Hosty' && hp.team === 0, 'player-host joins Team 1 from the host screen');
      H.emit('host:startRound'); await wait(60);
      ok(H.state.phase === 'faceoff' && H.state.round.faceoff[0] === hp.id, 'host player is in the face-off for their team');
      const room2 = require('../server.js').ff.rooms[hr.code], answers = room2.round.survey.answers;
      ok(!JSON.stringify(H.all).includes(JSON.stringify(answers[answers.length - 1].text)) && !H.state.hostAnswers && H.state.round.board.every(b => !b.text), 'player-host screen still shows no survey answers');
      H.emit('host:buzzFor', { pid: hp.id }); await wait(40); await call(H, 'host:guess', { text: answers[0].text }); await wait(60);
      ok(H.state.round.faceoffAnswers[0].pid === hp.id && H.state.round.board[0].text === answers[0].text, 'host player buzzes and guesses in the face-off');
      ok(H.state.phase === 'playpass' && H.state.round.control === 0, "host's team wins control from the host's #1 answer");
      H.emit('host:playPass', { choice: 'play' }); await wait(40); room2.round.survey.answers.forEach((_, i) => room2.round.revealed.add(i)); H.emit('host:skipRound'); await wait(40);
      ok(room2.players[hp.id].team === 0 && room2.teams.length === 2, 'host counts as a Team 1 member');
      H.emit('host:mode', { mode: 'dedicated' }); await wait(40);
      ok(H.state.players.some(p => p.isHost) && H.state.hostMode === 'player' && !H.state.hostAnswers, 'playing host cannot switch to Dedicated mid-game (answers stay hidden)');
      H.emit('host:newGame'); await wait(40); H.emit('host:mode', { mode: 'dedicated' }); await wait(40);
      ok(!H.state.players.some(p => p.isHost), 'switching to Dedicated host in the lobby removes the host from the teams');
      ok((await call(H, 'host:joinTeam', { team: 0 })).error, 'dedicated host cannot join a team'); }
  } catch (e) { failN++; console.log('  ✗ crashed:', e); }
  console.log(`\nHost-mode tests: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
