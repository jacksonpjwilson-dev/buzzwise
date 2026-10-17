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
      const T = () => room.turn, w = T().word, [gA, gB] = T().givers, [qA, qB] = T().guessers, A = T().starter, B = 1 - A;
      ok(gA !== gB && P[gA].state.word === w && P[gB].state.word === w && P[gA].state.role === 'giver' && P[gB].state.role === 'giver', 'BOTH teams\' clue-givers get the same word at the same time');
      const notYet = () => !seen(H, w) && !seen(P[qA], w) && !seen(P[qB], w);
      ok(notYet(), 'the shared screen and both guessers never get the word');
      ok(H.state.turn.team === A && H.state.turn.value === 10 && H.state.main.clues === 0, 'shared screen: starting team, worth 10, 0 clues');
      const act = () => P[T().givers[T().team]], idle = () => P[T().givers[1 - T().team]];
      ok(P[T().givers[A]].state.myTurn === true && P[T().givers[B]].state.myTurn === false, 'active giver vs waiting giver phones');
      ok((await call(idle(), 'player:clue')).error && (await call(idle(), 'player:judge', { correct: true })).error, 'the waiting team\'s giver cannot act');
      ok((await call(P[T().guessers[A]], 'player:judge', { correct: true })).error, 'guessers cannot mark Correct');
      await call(act(), 'player:clue'); await wait(20);
      ok(H.state.main.clues === 1 && H.state.turn.value === 10 && H.state.main.given, 'clue 1 is worth 10');
      ok((await call(act(), 'player:clue')).error, 'only one clue per turn');
      await call(act(), 'player:judge', { correct: false }); await wait(20);
      ok(T().team === B && H.state.turn.team === B && H.state.turn.value === 9, 'wrong -> other team\'s turn, now worth 9');
      await call(act(), 'player:clue'); await call(act(), 'player:judge', { correct: false }); await wait(20);
      ok(T().team === A && H.state.turn.value === 8 && H.state.main.clues === 2, 'turns alternate A → B → A; value 10 → 9 → 8 across both teams');
      ok(notYet(), 'still hidden from the shared screen and guessers mid-word');
      await call(act(), 'player:clue'); await call(act(), 'player:judge', { correct: true }); await wait(30);
      ok(room.teams[A].score === 8 && room.teams[B].score === 0 && room.players[T().givers[A]].score === 8, 'first correct team wins the current value (8); other team gets nothing');
      ok(H.state.phase === 'reveal' && H.state.main.word === w && P[qA].state.word === w && P[qB].state.word === w, 'after it is solved the word is revealed on the shared screen and to everyone');
      await call(H, 'host:next'); await wait(20); ok(H.state.phase === 'getready' && !seen(H, room.turn.word), 'Get ready before the next word; next word hidden');
      await call(H, 'host:go'); await wait(20);
      ok(T().starter === B && T().team === B, 'the other team starts the next word');
      ok(T().givers[A] === qA && T().guessers[A] === gA && T().givers[B] === qB, 'giver / guesser roles rotate within each team');
      for (let i = 0; i < 10; i++) { await call(act(), 'player:clue'); await call(act(), 'player:judge', { correct: false }); } await wait(20);
      ok(room.phase === 'reveal' && room.teams[A].score === 8 && room.teams[B].score === 0 && room.last.points === 0, 'value hits 0 after 10 clues: nobody scores, word revealed');
      ok((await call(H, 'host:judge', { correct: true })).error, 'player-host screen cannot judge');
      await call(H, 'host:next');
      while (room.phase === 'turn' || room.phase === 'getready' || room.phase === 'reveal') { if (room.getReady) await call(H, 'host:go'); else if (room.phase === 'reveal') await call(H, 'host:next'); else await call(H, 'host:skip'); }
      await wait(40); const scores0 = room.teams.map(t => t.score), trailing = scores0[0] <= scores0[1] ? 0 : 1, words = [];
      ok(room.phase === 'lightningReady' && room.turn.team === trailing && !P[room.turn.giver].state.word, 'lightning: trailing team goes first; word not sent until its clock starts');
      for (let k = 0; k < 2; k++) {
        const lt = room.turn.team, lg = room.turn.giver, lq = room.turn.guesser, mem = room.teams[lt].members;
        ok(mem.includes(lg) && mem.includes(lq) && lg !== lq, `lightning ${k + 1}: giver + guesser from ${room.teams[lt].name}`);
        await call(H, 'host:lightningGo'); await wait(20); const lw = room.turn.word; words.push(lw);
        ok(P[lg].state.word === lw && !seen(H, lw) && !seen(P[lq], lw), `lightning ${k + 1}: word only on that team's giver phone`);
        const before = room.teams[lt].score; await call(P[lg], 'player:judge', { correct: true }); words.push(room.turn.word); await call(P[lg], 'player:judge', { correct: true }); await wait(20);
        ok(room.teams[lt].score === before + 20 && room.turn.got === 2, `lightning ${k + 1}: +10 per correct word`);
        await wait(450);
        if (k === 0) ok(room.phase === 'lightningReady' && room.turn.team !== lt && H.state.lightning.done.length === 1, 'after the clock, the NEXT team gets ready (host Start between teams)');
      }
      ok(new Set(words).size === words.length, 'each team gets different words');
      ok(room.phase === 'gameOver' && H.state.lightning.done.length === 2 && H.state.lightning.done.every(r => r.got === 2 && r.words.length === 2 && r.words[0].word), 'every team played a lightning round; final standings reveal lists them');
      [H, ...Object.values(P)].forEach(s => s.disconnect()); }
    { const H = mk('/pw'), P = {}; const { code } = await call(H, 'host:create');
      await call(H, 'host:mode', { mode: 'dedicated' });
      for (const n of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) { P[n] = mk('/pw'); await call(P[n], 'player:join', { code, name: n, pid: n }); }
      await call(H, 'host:start'); await call(H, 'host:go'); await wait(30); const room = pw.rooms[code], t = room.turn, order = [];
      ok(t.givers.length === 3 && t.givers.every(g => P[g].state.word === t.word) && t.guessers.every(q => !seen(P[q], t.word)), '3 teams: all three givers get the word, no guesser does');
      for (let i = 0; i < 4; i++) { order.push(room.turn.team); await call(P[room.turn.giver], 'player:judge', { correct: false }); }
      await wait(30); ok(order.join() === '0,1,2,0' && H.state.turn.value === 6, 'round-robin turns across 3 teams (0 → 1 → 2 → 0), value 6 after 4 clues');
      await call(H, 'host:clue'); await call(H, 'host:judge', { correct: true }); await wait(20);
      ok(room.teams[1].score === 6 && room.phase === 'reveal', 'dedicated referee: Gave clue + Correct scores the active team');
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
