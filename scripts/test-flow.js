// End-to-end flow test: host + 2 players via socket.io-client against an in-process server.
require('./autogo');
const { server, rooms } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
function client(url) { const s = io(url, { transports: ['websocket'], forceNew: true }); s.state = null; s.errors = []; s.all = []; s.on('state', st => { s.state = st; s.all.push(JSON.stringify(st)); }); s.on('errorMsg', e => s.errors.push(e)); return s; }
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  try {
    const host = client(url), a = client(url), b = client(url);
    const { code } = await call(host, 'host:create', {});
    ok(/^[A-Z]{5}$/.test(code), `room created with code ${code}`);
    ok((await call(a, 'player:join', { code: 'ZZZZZ', name: 'X', pid: 'x' })).error, 'bad code rejected');
    await call(a, 'player:join', { code: code.toLowerCase(), name: 'Alice', pid: 'pa' });
    await call(b, 'player:join', { code, name: 'Bob', pid: 'pb' });
    ok((await call(client(url), 'player:join', { code, name: 'alice', pid: 'pc' })).error, 'duplicate name rejected');
    await wait(100);
    ok(host.state.players.length === 2, 'host sees 2 players');
    host.emit('host:start'); await wait(80); ok(host.errors.includes('Pick a board first'), 'cannot start without board');
    host.emit('host:selectBoard', { boardId: 'jackpot' }); host.emit('host:start'); await wait(100);
    ok(host.state.phase === 'board' && host.state.round === 0 && host.state.grid[0].clues[4].value === 1000, 'round 1 started, values 200-1000');
    const room = rooms[code]; ok(room.dd.size === 1, 'exactly 1 Daily Double in round 1');
    const [ddc, ddr] = [...room.dd][0].split('-').map(Number);
    // find a normal clue
    let nc = 0, nr = 0; if (nc === ddc && nr === ddr) nc = 1;
    host.emit('host:open', { c: nc, r: nr }); await wait(100);
    ok(host.state.current && host.state.current.clue.q.length > 5, 'host sees clue text + answer');
    ok(a.state.current && a.state.current.clue === undefined && !JSON.stringify(a.state).includes(host.state.current.clue.a), 'players do NOT receive clue/answer');
    ok(a.state.current.buzzOpen, 'buzzers armed immediately');
    ok(a.state.grid && a.state.open && a.state.open.c === nc, 'player knows which square is open');
    a.emit('player:buzz'); b.emit('player:buzz'); await wait(100);
    ok(host.state.current.buzzed === 'pa' && b.state.current.buzzed === 'pa', 'first buzz (Alice) locks out Bob');
    host.emit('host:judge', { correct: false }); await wait(100);
    ok(a.state.me.score === -200 && b.state.current.buzzOpen && a.state.current.lockedOut, 'incorrect: -200, buzzers reopen for others, Alice locked');
    a.emit('player:buzz'); await wait(60); ok(!host.state.current.buzzed, 'locked-out player cannot rebuzz');
    b.emit('player:buzz'); await wait(60); host.emit('host:judge', { correct: true }); await wait(100);
    ok(b.state.me.score === 200 && host.state.controller === 'pb' && host.state.current === null, 'correct: Bob +200, gets control, clue closed');
    ok(host.state.grid[nc].clues[nr].used, 'square marked used');
    ok(a.state.current === null && a.state.grid.length === 6 && a.state.grid.every(c => c.clues.length === 5) && a.state.grid[nc].clues[nr].used && !a.state.grid[ddc === nc + 1 ? 2 : nc + 1].clues[0].used, 'players get live board (6x5, used square greyed) after judging');
    // daily double
    host.emit('host:open', { c: ddc, r: ddr }); await wait(100);
    ok(host.state.current.dd && b.state.current.ddPlayer === 'pb' && !b.state.current.buzzOpen, 'Daily Double goes to player in control, no buzzers');
    a.emit('player:buzz'); await wait(50); ok(!host.state.current.buzzed, 'buzz ignored during DD');
    ok((await call(b, 'player:ddWager', { amount: 99999 })).error, 'over-max DD wager rejected');
    await call(b, 'player:ddWager', { amount: 1000 }); await wait(80);
    host.emit('host:judge', { correct: true }); await wait(100);
    ok(b.state.me.score === 1200, 'DD correct adds wager (Bob 1200)');
    // clear rest of round 1
    for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++) if (!host.state.grid[c].clues[r].used) { host.emit('host:open', { c, r }); await wait(15); host.emit('host:close'); await wait(15); }
    await wait(100); ok(host.state.phase === 'roundEnd', 'round 1 ends when board cleared');
    host.emit('host:nextRound'); await wait(100);
    ok(host.state.round === 1 && host.state.grid[0].clues[0].value === 400 && host.state.grid[0].clues[4].value === 2000, 'Double Jeopardy: values doubled');
    ok(room.dd.size === 2, '2 Daily Doubles in Double Jeopardy');
    ok(b.state.grid[0].clues[0].value === 400 && b.state.grid.every(c => c.clues.every(x => !x.used)), 'players get fresh Double Jeopardy board');
    ok(host.state.controller === 'pa', 'lowest scorer (Alice) picks first in DJ');
    ok(host.state.grid[0].name !== require('../data/questions.json').find(x => x.id === 'jackpot').rounds[0][0].name, 'new categories in round 2');
    const dds = [...room.dd].map(k => k.split('-').map(Number));
    host.emit('host:open', { c: dds[0][0], r: dds[0][1] }); await wait(80);
    await call(a, 'player:ddWager', { amount: 500 }); await wait(50); host.emit('host:judge', { correct: false }); await wait(80);
    ok(a.state.me.score === -700 && host.state.current === null, 'DD wrong subtracts wager, closes clue (Alice -700)');
    let n = 0; for (let c = 0; c < 6 && n < 1; c++) for (let r = 0; r < 5 && n < 1; r++) if (!host.state.grid[c].clues[r].used && !room.dd.has(`${c}-${r}`)) { n++;
      host.emit('host:open', { c, r }); await wait(60); a.emit('player:buzz'); await wait(60); host.emit('host:judge', { correct: true }); await wait(80);
      ok(a.state.me.score === -700 + host.state.grid[c].clues[r].value, 'DJ correct uses doubled value'); }
    host.emit('host:nextRound'); await wait(100);
    ok(host.state.phase === 'final' && host.state.final.stage === 'wager' && a.state.final.category, 'Final Jeopardy: category shown, wagering');
    ok(!JSON.stringify(a.state).includes(host.state.final.clue), 'players do not get final clue text');
    const bobScore = b.state.me.score, aliceScore = a.state.me.score;
    ok((await call(b, 'player:finalWager', { amount: bobScore + 1 })).error, 'final wager > score rejected');
    await call(b, 'player:finalWager', { amount: 1000 });
    ok(!JSON.stringify(a.state).includes('"myWager":1000'), 'wagers are private');
    host.emit('host:finalClue'); await wait(80);
    ok(host.state.final.wagers.pa === 0 || aliceScore > 0, 'non-positive score auto-wagers 0');
    await call(a, 'player:finalAnswer', { answer: 'What is the Lusitania?' });
    await call(b, 'player:finalAnswer', { answer: 'that big ship' });
    host.emit('host:finalLock'); await wait(80);
    ok(host.state.final.answers.pb === 'that big ship', 'host sees final answers');
    host.emit('host:finalJudge', { pid: 'pb', correct: true }); host.emit('host:finalJudge', { pid: 'pa', correct: false }); await wait(100);
    ok(b.state.me.score === bobScore + 1000 && host.state.phase === 'over', `final judged, game over (Bob ${b.state.me.score}, Alice ${a.state.me.score})`);
    // leak audit across EVERY state message ever sent to players
    const B = require('../data/questions.json').find(x => x.id === 'jackpot');
    const secrets = [B.final.clue, B.final.answer, ...B.rounds.flat().flatMap(c => c.clues.flatMap(x => [x.q, x.a]))].filter(t => t.length >= 6);
    const msgs = [...a.all, ...b.all];
    const leaks = msgs.filter(m => /"(clue|answer|q|a)":/.test(m) || secrets.some(t => m.includes(JSON.stringify(t).slice(1, -1))));
    ok(msgs.length > 50 && leaks.length === 0, `no clue/answer text in any of ${msgs.length} player state messages (incl. DD + Final)`);
    // reconnect
    b.disconnect(); await wait(80); ok(host.state.players.find(p => p.id === 'pb').connected === false, 'disconnect shown');
    const b2 = client(url); await call(b2, 'player:join', { code, name: 'Bob', pid: 'pb' }); await wait(80);
    ok(b2.state.me.score === bobScore + 1000, 'player rejoins with score intact');
    host.emit('host:newGame'); await wait(80); ok(host.state.phase === 'lobby' && host.state.players.every(p => p.score === 0), 'new game resets to lobby');
    ok(host.errors.length === 1, `no unexpected host errors (${JSON.stringify(host.errors)})`);
  } catch (e) { failN++; console.error(e); }
  console.log(`\n${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
