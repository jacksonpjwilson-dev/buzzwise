// Password, Cards Against Everyone, Priorities: secrets never reach the wrong client, scoring, rotation, get-ready gate.
process.env.PW_LIGHTNING_MS = '400';
const { server, pw, cae, pri } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d || {}, r));
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const mk = ns => { const s = io(base + ns, { transports: ['websocket'], forceNew: true }); s.all = []; s.on('state', x => { s.state = x; s.all.push(JSON.stringify(x)); }); return s; };
  const seen = (s, txt) => s.all.some(x => x.includes(JSON.stringify(txt)));
  try {
    // ---------------- PASSWORD ----------------
    console.log('Password');
    { const H = mk('/pw'), P = {}; const { code } = await call(H, 'host:create');
      for (const n of ['A1', 'A2', 'B1', 'B2']) { P[n] = mk('/pw'); await call(P[n], 'player:join', { code, name: n, pid: n }); }
      ok((await call(H, 'host:start')).ok !== false && H.state.phase === 'getready', 'start shows the Get ready screen first');
      const room = pw.rooms[code]; const g0 = room.turn;
      ok(!seen(H, g0.word) && Object.values(P).every(s => !seen(s, g0.word)), 'no word sent to anyone before Start');
      ok((await call(P[g0.giver], 'player:judge', { correct: true })).error, 'giver cannot act before Start');
      await call(H, 'host:go'); await wait(40);
      const w = room.turn.word, giver = room.turn.giver, guesser = room.turn.guesser;
      ok(P[giver].state.word === w && P[giver].state.role === 'giver', 'clue-giver phone gets the word');
      ok(!seen(H, w) && !seen(P[guesser], w) && Object.entries(P).filter(([n]) => n !== giver).every(([, s]) => !seen(s, w)), 'word never reaches the shared screen, guesser or others');
      await call(P[giver], 'player:clue'); await call(P[giver], 'player:clue'); await wait(30);
      ok(H.state.turn.value === 8, 'value drops per clue: 10 → 9 → 8');
      ok((await call(P[guesser], 'player:judge', { correct: true })).error, 'guesser cannot mark Correct');
      await call(P[giver], 'player:judge', { correct: true }); await wait(30);
      const ti = room.teams.findIndex(t => t.members.includes(giver));
      ok(room.teams[ti].score === 8 && room.players[giver].score === 8 && room.players[guesser].score === 8, 'Correct scores 8 for both teammates');
      ok(H.state.phase === 'getready', 'Get ready before the next word');
      await call(H, 'host:go'); await wait(20); ok(room.turn.team !== ti, 'turn passes to the other team');
      await call(P[room.turn.giver], 'player:judge', { correct: false }); await wait(20); await call(H, 'host:go'); await wait(20);
      ok(room.turn.team === ti && room.turn.giver === guesser && room.turn.guesser === giver, 'roles swap on the team\'s next word');
      ok((await call(H, 'host:judge', { correct: true })).error, 'player-host screen cannot judge');
      while (room.phase === 'turn' || room.phase === 'getready') { if (room.getReady) await call(H, 'host:go'); else await call(P[room.turn.giver], 'player:judge', { correct: false }); }
      ok(room.phase === 'lightningReady' && !P[room.turn.giver].state.word, 'lightning round: ready, word not sent until the clock starts');
      await call(H, 'host:lightningGo'); await wait(20); const lw = room.turn.word; ok(P[room.turn.giver].state.word === lw && !seen(H, lw), 'lightning word only on giver phone');
      const lt = room.turn.team, before = room.teams[lt].score; await call(P[room.turn.giver], 'player:judge', { correct: true }); await call(P[room.turn.giver], 'player:judge', { correct: true }); await wait(20);
      ok(room.teams[lt].score === before + 20 && room.turn.got === 2, 'lightning: +10 per correct word');
      await wait(450); ok(room.phase === 'gameOver', 'lightning clock ends the game');
      [H, ...Object.values(P)].forEach(s => s.disconnect()); }
    // ---------------- CARDS AGAINST EVERYONE ----------------
    console.log('Cards Against Everyone');
    { const H = mk('/cae'), P = {}; const { code } = await call(H, 'host:create');
      for (const n of ['Ann', 'Bob', 'Cat', 'Dan']) { P[n] = mk('/cae'); await call(P[n], 'player:join', { code, name: n, pid: n }); }
      ok((await call(H, 'host:settings', { decks: ['fun', 'afterdark'] })).error, 'After Dark requires an 18+ confirmation');
      await call(H, 'host:settings', { decks: ['fun', 'afterdark', 'office'], adultConfirmed: true, target: 2, writeIns: true }); await wait(20);
      ok(H.state.decks.join() === 'fun,afterdark,office', 'host combines decks (Fun + After Dark + Office)');
      await call(H, 'host:start'); await wait(30); const room = cae.rooms[code];
      ok(H.state.phase === 'getready' && !seen(H, room.round.prompt.text) && Object.values(P).every(s => !seen(s, room.round.prompt.text)), 'Get ready: prompt not sent before Start');
      await call(H, 'host:go'); await wait(30);
      ok(Object.values(P).every(s => s.state.hand.length === 7), '7-card hands');
      const hands = Object.fromEntries(Object.keys(P).map(n => [n, P[n].state.hand.map(c => c.text)]));
      ok(Object.entries(P).every(([n, s]) => Object.entries(hands).filter(([m]) => m !== n).every(([, h]) => h.every(t => !s.all.some(x => x.includes(JSON.stringify(t)) && !hands[n].includes(t))))) && Object.values(hands).flat().every(t => !seen(H, t)), 'hands go only to their owner (not other phones or the shared screen)');
      let czar = room.round.czar; ok(czar === 'Ann', 'first Card Czar is the first player');
      ok((await call(P[czar], 'player:submit', { ids: [P[czar].state.hand[0].id] })).error, 'the Czar cannot play a card');
      const pick = room.round.prompt.pick; const played = {};
      for (const n of Object.keys(P).filter(x => x !== czar)) { const cards = P[n].state.hand.filter(c => !c.blank).slice(0, pick); played[n] = cards.map(c => c.text); await call(P[n], 'player:submit', { ids: cards.map(c => c.id) }); }
      await wait(40);
      ok(H.state.phase === 'judge' && H.state.round.shown.length === 3 && H.state.round.shown.every(s => !s.pid), 'all played → judging; submissions anonymous on shared screen');
      ok(Object.values(P).every(s => s.state.round.shown.every(x => !x.pid)), 'phones also do not learn who played what');
      ok((await call(P.Bob, 'player:pick', { sid: H.state.round.shown[0].sid })).error, 'only the Czar picks');
      const winSid = H.state.round.shown.find(s => s.cards.join() === played.Cat.join()).sid; await call(P[czar], 'player:pick', { sid: winSid }); await wait(30);
      ok(room.players.Cat.score === 1 && H.state.round.winner === 'Cat' && H.state.round.shown.every(s => s.pid), 'Czar picks on phone: winner +1, authors revealed after');
      ok(Object.values(P).filter((s, i) => Object.keys(P)[i] !== czar).every(s => s.state.hand.length === 7 - pick), 'played cards leave the hand');
      await call(H, 'host:next'); await call(H, 'host:go'); await wait(30);
      ok(room.round.czar === 'Bob' && Object.values(P).every(s => s.state.hand.length === 7), 'Czar rotates; hands refilled to 7');
      // write-in blank card
      const blank = { id: 999999, blank: true, text: '✏️ Blank card' }; room.hands.Cat.push(blank);
      const pk = room.round.prompt.pick, ids = [999999, ...room.hands.Cat.filter(c => !c.blank).slice(0, pk - 1).map(c => c.id)];
      ok((await call(P.Cat, 'player:submit', { ids })).error, 'blank card needs text');
      await call(P.Cat, 'player:submit', { ids, texts: ['my custom card'] }); ok(room.round.subs.Cat.cards[0] === 'my custom card', 'custom write-in blank card');
      for (const n of ['Ann', 'Dan']) { const c = room.hands[n].filter(x => !x.blank).slice(0, pk); await call(P[n], 'player:submit', { ids: c.map(x => x.id) }); }
      await wait(30); const sid = H.state.round.shown.find(s => s.cards[0] === 'my custom card').sid; await call(P.Bob, 'player:pick', { sid }); await wait(30);
      ok(room.players.Cat.score === 2 && H.state.phase === 'gameOver', 'first to N points wins');
      // dedicated host judges
      await call(H, 'host:newGame'); await call(H, 'host:mode', { mode: 'dedicated' }); await call(H, 'host:start'); await call(H, 'host:go'); await wait(30);
      ok(room.round.czar === null && Object.values(P).every(s => s.state.round.needed === 4), 'dedicated host mode: host judges, everyone plays');
      [H, ...Object.values(P)].forEach(s => s.disconnect()); }
    // ---------------- PRIORITIES ----------------
    console.log('Priorities');
    for (const mode of ['individual', 'team']) {
      const H = mk('/pri'), P = {}; const { code } = await call(H, 'host:create');
      for (const n of ['Ann', 'Bob', 'Cat']) { P[n] = mk('/pri'); await call(P[n], 'player:join', { code, name: n, pid: n }); }
      await call(H, 'host:settings', { guessMode: mode }); await call(H, 'host:start'); await wait(20); const room = pri.rooms[code];
      ok(H.state.phase === 'getready' && !seen(H, room.round.items[0]) && Object.values(P).every(s => !seen(s, room.round.items[0])), `${mode}: items not shown before Start`);
      await call(H, 'host:go'); await wait(20); const subj = room.round.subject; ok(subj === 'Ann', `${mode}: first subject is the first player`);
      ok((await call(P.Bob, 'player:rank', { order: [0, 1, 2, 3, 4] })).error, `${mode}: only the subject ranks`);
      const rank = [3, 1, 4, 0, 2]; await call(P.Ann, 'player:rank', { order: rank }); await wait(30);
      const rk = JSON.stringify(rank);
      ok(P.Ann.state.round.rank && !H.all.some(x => x.includes(`"rank":${rk}`)) && !P.Bob.all.some(x => x.includes(`"rank":${rk}`)), `${mode}: ranking only on the subject's phone (not shared screen / guessers)`);
      if (mode === 'individual') {
        await call(P.Bob, 'player:guess', { order: rank }); await wait(20);
        ok(!P.Cat.all.some(x => x.includes(`"myGuess":${rk}`)) && H.state.phase === 'guessing', 'guesses stay private until reveal');
        await call(P.Cat, 'player:guess', { order: [3, 1, 0, 4, 2] }); await wait(30);
        ok(H.state.phase === 'reveal' && room.players.Bob.score === 15 && room.players.Cat.score === 6, 'scoring: 2/spot (+5 perfect) → Bob 15, Cat 6');
      } else {
        await call(P.Cat, 'player:guess', { order: [3, 1, 4, 2, 0] }); await wait(30);
        ok(H.state.phase === 'reveal' && room.players.Bob.score === 6 && room.players.Cat.score === 6 && room.players.Ann.score === 0, 'team mode: one guess, every guesser scores 6');
      }
      ok(H.state.round.rank.join() === rank.join(), `${mode}: shared screen gets the order at the reveal`);
      await call(H, 'host:next'); await call(H, 'host:go'); await wait(20); ok(room.round.subject === 'Bob', `${mode}: subject rotates`);
      [H, ...Object.values(P)].forEach(s => s.disconnect());
    }
  } catch (e) { failN++; console.log('  ✗ crashed:', e); }
  console.log(`\nParty-mode tests: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
