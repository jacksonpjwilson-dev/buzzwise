// The Price Is Right flow test: prices never sent before reveal; row, 5 pricing games, showdown, final showcase.
require('./autogo');
process.env.PIR_CLOCK_SECS = '2';
const { server, pir } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d || {}, r));
const leaks = []; let msgs = 0;
function audit(x, who) { msgs++; const bad = m => leaks.push(who + ': ' + m);
  if (x.row && (x.row.item.price !== undefined) !== x.row.revealed) bad('row price');
  if (x.row && !x.row.revealed && x.row.mode === 'secret' && x.row.bids.some(b => b.bid !== undefined)) bad('secret bid');
  const g = x.game; if (g) { if ((g.prize.price !== undefined) !== g.over) bad('prize price');
    if (g.type === 'higherlower') g.items.forEach(it => { if ((it.price !== undefined) !== !!it.pick) bad('hl price'); });
    if (g.type === 'cliff') g.items.forEach(it => { if ((it.price !== undefined) !== (it.guess !== undefined)) bad('cliff price'); });
    if (g.type === 'clock') g.items.forEach((it, i) => { if (it.price !== undefined && !g.solved[i] && !g.over) bad('clock price'); });
    if (g.type === 'plinko') g.items.forEach(it => { if ((it.price !== undefined) !== (it.pick !== undefined)) bad('plinko price'); });
    if (g.type === 'anynumber' && !g.over) g.slots.forEach(d => { if (d !== null && !g.picked.includes(d)) bad('digit'); }); }
  if (x.final && !x.final.revealed && (x.final.total !== undefined || x.final.items.some(i => i.price !== undefined) || x.final.bids)) bad('showcase'); }
server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/pir`;
  const mk = n => { const s = io(url, { transports: ['websocket'], forceNew: true }); s.on('state', x => { s.state = x; audit(x, n); }); return s; };
  try {
    const host = mk('host'); const P = ['p1', 'p2', 'p3', 'p4'].map(mk);
    const { code } = await call(host, 'host:create'); for (let i = 0; i < 4; i++) await call(P[i], 'player:join', { code, name: 'P' + (i + 1), pid: 'p' + (i + 1) });
    const room = pir.rooms[code]; await wait(50); ok(host.state.players.length === 4, '4 players joined');
    // --- Contestants' Row (secret) ---
    await call(host, 'host:row'); await wait(40); const price = room.row.item.price;
    ok(host.state.phase === 'row' && host.state.row.item.name && host.state.row.item.price === undefined, 'row item shown without price');
    await call(P[0], 'player:bid', { amount: Math.round(price) }); // exact (rounded) — may be just over if .5+
    const ex = Math.round(price) <= price;
    await call(P[1], 'player:bid', { amount: Math.max(1, Math.floor(price) - 3) });
    ok((await call(P[2], 'player:bid', { amount: Math.max(1, Math.floor(price) - 3) })).error, 'duplicate bid amount rejected');
    await call(P[2], 'player:bid', { amount: Math.round(price) + 50 }); await wait(30);
    ok(host.state.row.bids.filter(b => b.done).length === 3 && host.state.row.bids.every(b => b.bid === undefined), 'secret bids hidden until all are in');
    await call(P[3], 'player:bid', { amount: 1 }); await wait(50);
    ok(host.state.row.revealed && host.state.row.item.price === price, 'price revealed when all bids are in');
    ok(host.state.row.winner === 'p1' && host.state.row.exact && room.players.p1.winnings === price + 500, 'closest without going over wins; exact bid +$500');
    // --- Higher/Lower ---
    await call(host, 'host:game', { type: 'higherlower' }); await wait(30); const hl = room.game;
    for (const it of hl.items) { if (hl.over) break; await call(P[0], 'player:move', { choice: it.price > it.shown ? 'higher' : 'lower' }); }
    await wait(30); ok(host.state.game.over && host.state.game.won && host.state.game.prize.price !== undefined, 'Higher/Lower: 2 right wins prize, price then revealed');
    ok((await call(P[1], 'player:move', { choice: 'higher' })).error, 'only the contestant can play');
    // --- Row 2: overbid + sequential mode ---
    host.emit('host:bidMode', { mode: 'sequential' }); await call(host, 'host:row'); await wait(30);
    const r2 = room.row; ok(r2.mode === 'sequential' && !r2.contestants.includes('p1'), 'sequential mode; previous winner leaves the row');
    const first = r2.contestants[0], second = r2.contestants[1];
    ok((await call(P[+second.slice(1) - 1], 'player:bid', { amount: 99999 })).error, 'sequential: must wait for turn');
    for (const id of r2.contestants) await call(P[+id.slice(1) - 1], 'player:bid', { amount: Math.round(r2.item.price) + 100 + +id.slice(1) });
    await wait(30); ok(host.state.row.revealed && !host.state.row.winner && /overbid/i.test(host.state.message), 'everyone over -> no winner');
    host.emit('host:rebid'); await wait(30); ok(!host.state.row.revealed && host.state.row.bids.every(b => !b.done), 're-bid resets');
    await call(P[+first.slice(1) - 1], 'player:bid', { amount: 1 }); await wait(30);
    ok(host.state.row.bids.find(b => b.id === first).bid === 1, 'sequential bids are visible');
    for (const id of r2.contestants.slice(1)) await call(P[+id.slice(1) - 1], 'player:bid', { amount: Math.round(r2.item.price) + 300 + +id.slice(1) });
    await wait(30); ok(host.state.row.winner === first, 'lone under-bidder wins');
    const W = P[+first.slice(1) - 1];
    // --- Any Number-ish ---
    await call(host, 'host:game', { type: 'anynumber' }); await wait(20);
    for (const d of [...new Set(String(Math.round(room.game.prize.price)))]) await call(W, 'player:move', { digit: d }); await wait(30);
    ok(host.state.game.over && host.state.game.won, 'Any Number-ish: all digits found wins');
    // --- Cliff (lose by going over 25 steps) ---
    await call(host, 'host:game', { type: 'cliff' }); await wait(20);
    await call(W, 'player:move', { guess: Math.round(room.game.items[0].price) + 30 }); await wait(30);
    ok(host.state.game.over && !host.state.game.won && host.state.game.steps > 25, 'Cliff Climber: >25 steps falls');
    await call(host, 'host:game', { type: 'cliff' }); await wait(20);
    for (const it of room.game.items) await call(W, 'player:move', { guess: Math.round(it.price) + 2 }); await wait(30);
    ok(host.state.game.won && host.state.game.steps === 6, 'Cliff Climber: within 25 steps wins');
    // --- Clock Game ---
    await call(host, 'host:game', { type: 'clock' }); await wait(20); const ck = room.game;
    await call(W, 'player:move', { start: true }); const t0 = Math.round(ck.items[0].price);
    await call(W, 'player:move', { guess: t0 - 5 }); await wait(20); ok(host.state.game.hint === 'HIGHER' && host.state.game.items[0].price === undefined, 'Clock: says HIGHER without revealing price');
    await call(W, 'player:move', { guess: t0 + 5 }); await wait(20); ok(host.state.game.hint === 'LOWER', 'Clock: says LOWER');
    await call(W, 'player:move', { guess: t0 }); await wait(20); ok(host.state.game.solved[0] && host.state.game.items[0].price !== undefined, 'Clock: correct guess reveals item');
    await wait(2200); ok(host.state.game.over, 'Clock: timer runs out at 30s (test: 2s)');
    // --- Plinko ---
    await call(host, 'host:game', { type: 'plinko' }); await wait(20); const pl = room.game;
    for (let i = 0; i < 4; i++) await call(W, 'player:move', { price: i < 2 ? Math.round(pl.items[i].price) : pl.items[i].options.find(o => o !== Math.round(pl.items[i].price)) });
    await wait(20); ok(host.state.game.chips === 3, 'Plinko: 1 free + 2 earned chips');
    for (let i = 0; i < 3; i++) await call(W, 'player:move', { drop: true }); await wait(30);
    ok(host.state.game.over && host.state.game.drops.length === 3 && host.state.game.drops.every(d => pir.PLINKO[d.slot] === d.win), 'Plinko: 3 chips dropped into slots, winnings tallied');
    // --- Showcase Showdown (forced spins) ---
    Object.assign(room.players.p1, { winnings: 5000 }); Object.assign(room.players.p2, { winnings: 4000 }); Object.assign(room.players.p3, { winnings: 3000 }); room.players.p4.winnings = 0;
    await call(host, 'host:showdown'); await wait(20); ok(host.state.showdown.spinners.join() === 'p1,p2,p3', 'top 3 spin');
    const WH = pir.SHOWDOWN_WHEEL, rnd = Math.random, force = v => { Math.random = () => (WH.indexOf(v) + 0.5) / WH.length; };
    force(60); await call(P[0], 'player:spin'); force(55); await call(P[0], 'player:spin'); Math.random = rnd; await wait(20);
    ok(host.state.showdown.totals.p1 === 115 && host.state.showdown.turn === 'p2', 'over $1.00 is out');
    force(70); await call(P[1], 'player:spin'); Math.random = rnd; await call(P[1], 'player:stay'); await wait(20);
    force(100); await call(P[2], 'player:spin'); Math.random = rnd; await wait(30);
    ok(host.state.showdown.winner === 'p3' && room.players.p3.winnings === 4000, 'exactly $1.00 wins + $1,000 bonus');
    // --- Final Showcase ---
    await call(host, 'host:final'); await wait(20); const fs = room.final;
    ok(fs.players[0] === 'p3' && host.state.final.total === undefined && host.state.final.items.every(i => i.price === undefined), 'showcase: showdown winner + runner-up, prices hidden');
    const [A, B] = fs.players.map(id => P[+id.slice(1) - 1]); const before = room.players[fs.players[0]].winnings;
    await call(A, 'player:finalBid', { amount: fs.total - 100 }); await call(B, 'player:finalBid', { amount: fs.total + 1 }); await wait(30);
    ok(host.state.final.revealed && host.state.final.winner === fs.players[0] && host.state.final.both, 'closest without going over wins; within $250 wins both');
    ok(room.players[fs.players[0]].winnings === before + fs.total * 2, 'both showcases added to winnings');
    ok(msgs > 80 && leaks.length === 0, `no price sent before reveal across ${msgs} messages${leaks.length ? ' ' + leaks.slice(0, 3) : ''}`);
  } catch (e) { failN++; console.error(e); }
  console.log(`\nPrice: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
