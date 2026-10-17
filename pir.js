// Buzzwise: The Price Is Right mode (socket.io namespace /pir)
// Prices are NEVER sent to any client until revealed, so the host can play too.
const fs = require('fs'), path = require('path'); const GR = require('./lib/getready');
const EXACT_BONUS = 500, SHOWCASE_RANGE = 250;
const CLOCK_SECS = () => +(process.env.PIR_CLOCK_SECS || 30);
const SHOWDOWN_WHEEL = [100, 15, 80, 35, 60, 20, 40, 75, 55, 95, 50, 85, 30, 65, 10, 45, 70, 25, 90, 5];
const PLINKO = [100, 500, 1000, 0, 10000, 0, 1000, 500, 100];
const GAMES = ['higherlower', 'anynumber', 'cliff', 'clock', 'plinko'];
const GAME_NAMES = { higherlower: 'Higher or Lower', anynumber: 'Any Number-ish', cliff: 'Cliff Climber', clock: 'Clock Game', plinko: 'Plinko-lite' };

function loadProducts() {
  return fs.readFileSync(path.join(__dirname, 'data', 'pir-products.txt'), 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.lastIndexOf('|'); return { name: l.slice(0, i).trim(), price: +l.slice(i + 1) }; });
}
const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const R = n => Math.floor(Math.random() * n);

module.exports = function attachPIR(io, makeCode) {
  const nsp = io.of('/pir'); const rooms = {}; const PRODUCTS = loadProducts();
  function take(room, filter = () => true) {
    let pool = PRODUCTS.map((p, i) => i).filter(i => !room.usedP.has(i) && filter(PRODUCTS[i]));
    if (!pool.length) pool = PRODUCTS.map((p, i) => i).filter(i => filter(PRODUCTS[i]));
    const i = pool[R(pool.length)]; room.usedP.add(i); return { ...PRODUCTS[i] };
  }
  const pub = (item, revealed) => revealed ? { name: item.name, price: item.price } : { name: item.name }; // the ONLY way items reach clients
  const plist = room => Object.values(room.players).map(p => ({ id: p.id, name: p.name, winnings: p.winnings, connected: p.connected, played: p.played }));

  function view(room) {
    const r = room.row, g = room.game, s = room.showdown, f = room.final;
    return {
      code: room.code, phase: room.phase, message: room.message, bidMode: room.bidMode, players: plist(room), gameNames: GAME_NAMES, wheel: SHOWDOWN_WHEEL, plinko: PLINKO,
      row: r && { item: pub(r.item, r.revealed), contestants: r.contestants, turn: r.mode === 'sequential' ? r.contestants[r.turnIdx] : null, mode: r.mode, revealed: r.revealed, winner: r.winner, exact: r.exact,
        bids: r.contestants.map(id => ({ id, done: r.bids[id] !== undefined, bid: r.revealed || r.mode === 'sequential' ? r.bids[id] : undefined })) },
      game: g && gameView(g),
      showdown: s && { spinners: s.spinners, turn: s.spinners[s.idx], totals: s.totals, spins: s.spins, last: s.last, done: s.done, winner: s.winner, rotation: s.rotation, spin: s.spin },
      final: f && { players: f.players, items: f.items.map(it => pub(it, f.revealed)), total: f.revealed ? f.total : undefined, done: f.players.map(id => f.bids[id] !== undefined), bids: f.revealed ? f.bids : undefined, revealed: f.revealed, winner: f.winner, both: f.both },
      now: Date.now(),
    };
  }
  function gameView(g) {
    const base = { type: g.type, name: GAME_NAMES[g.type], player: g.player, prize: pub(g.prize, g.over), over: g.over, won: g.won, message: g.message };
    if (g.type === 'higherlower') return { ...base, items: g.items.map((it, i) => ({ ...pub(it, it.answered), shown: it.shown, pick: it.pick, correct: it.answered ? it.correct : undefined })), idx: g.idx };
    if (g.type === 'anynumber') return { ...base, slots: String(Math.round(g.prize.price)).split('').map(d => g.picked.includes(d) || g.over ? d : null), picked: g.picked, misses: g.misses };
    if (g.type === 'cliff') return { ...base, items: g.items.map(it => ({ ...pub(it, it.guess !== undefined), guess: it.guess, steps: it.steps })), idx: g.idx, steps: g.steps, limit: 25 };
    if (g.type === 'clock') return { ...base, items: g.items.map(it => pub(it, it.solved || g.over)), solved: g.items.map(it => !!it.solved), idx: g.idx, endsAt: g.endsAt, hint: g.hint, lastGuess: g.lastGuess };
    if (g.type === 'plinko') return { ...base, items: g.items.map(it => ({ name: it.name, options: it.options, pick: it.pick, correct: it.pick !== undefined ? it.correct : undefined, price: it.pick !== undefined ? it.price : undefined })), idx: g.idx, chips: g.chips, drops: g.drops, total: g.total };
  }
  // Dedicated host: the host's own screen also gets the secret prices (players never do).
  const secrets = room => { const r = room.row, g = room.game, f = room.final, out = [];
    if (r && !r.revealed) out.push({ name: r.item.name, price: r.item.price });
    if (g) { if (g.prize && !g.over) out.push({ name: g.prize.name, price: g.prize.price }); (g.items || []).forEach(it => it && it.price !== undefined && out.push({ name: it.name, price: it.price })); }
    if (f && !f.revealed) f.items.forEach(it => out.push({ name: it.name, price: it.price }));
    return out; };
  const broadcast = room => {
    if (room.getReady) return nsp.to(room.code).emit('state', GR.view(room, plist(room).map(p => ({ name: p.name, score: money(p.winnings || 0) })).sort((a, b) => 0)));
    const v = view(room); v.hostMode = room.hostMode || 'player';
    if (room.hostMode === 'dedicated' && room.hostSocket) { nsp.to(room.code).except(room.hostSocket).emit('state', v); nsp.to(room.hostSocket).emit('state', { ...v, hostSecrets: secrets(room) }); }
    else nsp.to(room.code).emit('state', v);
  };

  // ----- Contestants' Row -----
  function startRow(room) {
    const fresh = Object.values(room.players).filter(p => !p.played && p.connected !== false);
    const pool = (fresh.length >= 2 ? fresh : Object.values(room.players)).slice(0, 4);
    room.row = { item: take(room, p => p.price >= 15), contestants: pool.map(p => p.id), bids: {}, revealed: false, winner: null, exact: false, mode: room.bidMode, turnIdx: 0 };
    room.game = null; room.phase = 'row';
    room.message = `Come on down! ${pool.map(p => p.name).join(', ')} — bid on the ${room.row.item.name}.`; GR.gate(room, "Contestants' Row", [`Come on down: ${pool.map(p => p.name).join(', ')}`]);
  }
  function rowBid(room, pid, amount) {
    const r = room.row; if (!r || room.phase !== 'row' || r.revealed) return { error: 'Bidding is closed' };
    if (!r.contestants.includes(pid)) return { error: "You're not on Contestants' Row" };
    if (r.bids[pid] !== undefined) return { error: 'You already bid' };
    if (r.mode === 'sequential' && r.contestants[r.turnIdx] !== pid) return { error: 'Wait for your turn' };
    amount = Math.round(+amount); if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return { error: 'Bid a whole-dollar amount' };
    if (Object.values(r.bids).includes(amount)) return { error: 'Someone already bid that amount' };
    r.bids[pid] = amount; r.turnIdx++;
    room.message = `${room.players[pid].name} has bid${r.mode === 'sequential' ? ' $' + amount : ''}.`;
    if (Object.keys(r.bids).length === r.contestants.length) revealRow(room);
    return { ok: true };
  }
  function revealRow(room) {
    const r = room.row; r.revealed = true; const price = r.item.price;
    const under = Object.entries(r.bids).filter(([, b]) => b <= price || b === Math.round(price));
    if (!under.length) { room.message = `Actual retail price: ${money(price)}. Everyone overbid! Bid again — lower!`; r.overbid = true; return; }
    under.sort((a, b) => b[1] - a[1]); const [wid, wb] = under[0]; const p = room.players[wid];
    r.winner = wid; r.exact = Math.round(price) === wb; p.winnings += price + (r.exact ? EXACT_BONUS : 0); p.played = true;
    room.message = `Actual retail price: ${money(price)}! ${p.name} wins${r.exact ? ` — EXACT BID, +$${EXACT_BONUS} bonus!` : '!'} Come on up!`;
  }

  // ----- Pricing games -----
  function startGame(room, type) {
    const pid = room.row && room.row.winner; if (!pid) return { error: "No Contestants' Row winner yet" };
    type = GAMES.includes(type) ? type : GAMES[R(GAMES.length)];
    const g = { type, player: pid, prize: take(room, p => p.price >= 100), over: false, won: false, message: '' };
    if (type === 'higherlower') { g.items = [0, 1, 2].map(() => { const it = take(room, p => p.price >= 5); let f; do { f = Math.round(it.price * (0.55 + Math.random() * 0.9)); } while (Math.abs(f - it.price) < Math.max(1, it.price * 0.08)); it.shown = f; return it; }); g.idx = 0; g.message = 'Is the actual price HIGHER or LOWER than shown? Get 2 of 3 to win.'; }
    if (type === 'anynumber') { g.picked = []; g.misses = 0; g.message = 'Pick digits 0-9. Reveal every digit of the prize price before 3 misses!'; }
    if (type === 'cliff') { g.items = [0, 1, 2].map(() => take(room, p => p.price >= 2 && p.price <= 45)); g.idx = 0; g.steps = 0; g.message = 'Guess each price. Every dollar off is a step up the mountain — over 25 steps and he falls!'; }
    if (type === 'clock') { g.items = [0, 1].map(() => take(room, p => p.price >= 20 && p.price <= 500)); g.idx = 0; g.endsAt = null; g.message = `Guess the price of each item in ${CLOCK_SECS()} seconds. We'll say higher or lower!`; }
    if (type === 'plinko') { g.items = [0, 1, 2, 3].map(() => { const it = take(room, p => p.price >= 3 && p.price <= 80); let f; do { f = Math.round(it.price * (Math.random() < .5 ? 0.6 + Math.random() * 0.25 : 1.2 + Math.random() * 0.4)); } while (f === Math.round(it.price)); const opts = [Math.round(it.price), f]; if (Math.random() < .5) opts.reverse(); it.options = opts; return it; }); g.idx = 0; g.chips = 1; g.drops = []; g.total = 0; g.message = 'Pick the real price of each item to earn Plinko chips (you start with 1).'; }
    room.game = g; room.phase = 'game'; room.message = `${room.players[pid].name} is playing ${GAME_NAMES[type]}! Prize: ${g.prize.name}.`; GR.gate(room, GAME_NAMES[type], [`${room.players[pid].name} is playing`]); return { ok: true };
  }
  function finishGame(room, won, extra) {
    const g = room.game; g.over = true; g.won = won; clearTimeout(room.clockTimer); const p = room.players[g.player];
    const amount = extra !== undefined ? extra : won ? g.prize.price : 0; p.winnings += amount;
    room.message = won ? `${p.name} WINS ${extra !== undefined ? money(amount) : 'the ' + g.prize.name + ' (' + money(g.prize.price) + ')'}! 🎉` : `${p.name} didn't win this time. The ${g.prize.name} was ${money(g.prize.price)}.`;
  }
  function gameMove(room, pid, m) {
    const g = room.game; if (!g || g.over) return { error: 'No game in progress' }; if (g.player !== pid && pid !== 'HOST') return { error: "It's not your game" };
    if (g.type === 'higherlower') { const it = g.items[g.idx]; if (!it || !['higher', 'lower'].includes(m.choice)) return { error: 'Pick higher or lower' };
      it.pick = m.choice; it.answered = true; it.correct = (m.choice === 'higher') === (it.price > it.shown); g.idx++;
      g.message = `${it.name}: ${money(it.price)} — ${it.correct ? 'correct!' : 'wrong!'}`;
      const right = g.items.filter(x => x.correct).length, wrong = g.items.filter(x => x.answered && !x.correct).length;
      if (right >= 2) finishGame(room, true); else if (wrong >= 2) finishGame(room, false); return { ok: true, correct: it.correct }; }
    if (g.type === 'anynumber') { const d = String(m.digit); if (!/^\d$/.test(d) || g.picked.includes(d)) return { error: 'Pick an unused digit' };
      g.picked.push(d); const digits = String(Math.round(g.prize.price)); const hit = digits.includes(d); if (!hit) g.misses++;
      g.message = hit ? `Yes! ${d} is in the price.` : `No ${d}. Miss ${g.misses} of 3.`;
      if (digits.split('').every(x => g.picked.includes(x))) finishGame(room, true); else if (g.misses >= 3) finishGame(room, false); return { ok: true, hit }; }
    if (g.type === 'cliff') { const it = g.items[g.idx]; const v = Math.round(+m.guess); if (!it || !Number.isFinite(v) || v < 0) return { error: 'Enter a whole-dollar guess' };
      it.guess = v; it.steps = Math.abs(v - Math.round(it.price)); g.steps += it.steps; g.idx++;
      g.message = `${it.name}: ${money(it.price)}. ${it.steps} step${it.steps === 1 ? '' : 's'} up (total ${g.steps}/25).`;
      if (g.steps > 25) finishGame(room, false); else if (g.idx >= 3) finishGame(room, true); return { ok: true, steps: it.steps }; }
    if (g.type === 'clock') { if (!g.endsAt) { g.endsAt = Date.now() + CLOCK_SECS() * 1000; room.clockTimer = setTimeout(() => { if (!g.over) { const got = g.items.filter(x => x.solved); finishGame(room, got.length === 2, got.reduce((s, x) => s + x.price, 0) || 0); if (got.length < 2) g.won = got.length > 0; room.message = `Time! ${room.players[g.player].name} wins ${money(got.reduce((s, x) => s + x.price, 0))} in prizes.`; broadcast(room); } }, CLOCK_SECS() * 1000); }
      if (m.start) return { ok: true };
      const v = Math.round(+m.guess); const it = g.items[g.idx]; if (!Number.isFinite(v)) return { error: 'Enter a number' };
      g.lastGuess = v; const target = Math.round(it.price);
      if (v === target) { it.solved = true; g.idx++; g.hint = 'RIGHT!'; g.message = `$${v} is RIGHT for the ${it.name}!`;
        if (g.idx >= 2) { finishGame(room, true, g.items.reduce((s, x) => s + x.price, 0) + 1000); room.message += ' Both items plus a $1,000 bonus!'; } }
      else { g.hint = v < target ? 'HIGHER' : 'LOWER'; g.message = `$${v}… ${g.hint}!`; }
      return { ok: true, hint: g.hint }; }
    if (g.type === 'plinko') {
      if (m.drop) { if (g.idx < 4) return { error: 'Price all four items first' }; if (g.chips <= 0) return { error: 'No chips left' };
        g.chips--; let col = 4; const path = []; for (let i = 0; i < 8; i++) { col = Math.max(0, Math.min(8, col + (Math.random() < .5 ? -1 : 1) * (i % 2 ? 1 : 0) + (i % 2 ? 0 : R(3) - 1))); path.push(col); }
        const slot = path[path.length - 1], win = PLINKO[slot]; g.drops.push({ path, slot, win }); g.total += win;
        g.message = `Chip lands on ${win ? '$' + win.toLocaleString() : '$0'}!`;
        if (!g.chips) finishGame(room, g.total > 0, g.total); return { ok: true, slot, win }; }
      const it = g.items[g.idx]; if (!it || !it.options.includes(+m.price)) return { error: 'Pick one of the two prices' };
      it.pick = +m.price; it.correct = it.pick === Math.round(it.price); if (it.correct) g.chips++; g.idx++;
      g.message = it.correct ? `Correct! That's a chip. (${g.chips} chips)` : `Nope — it's ${money(it.price)}.`; return { ok: true, correct: it.correct }; }
  }

  // ----- Showcase Showdown -----
  function startShowdown(room, ids) {
    const top = (ids && ids.length ? ids : plist(room).sort((a, b) => b.winnings - a.winnings).slice(0, 3).map(p => p.id)).filter(id => room.players[id]);
    room.showdown = { spinners: top, idx: 0, totals: {}, spins: {}, last: null, done: false, winner: null, rotation: 0, spin: null, spinoff: false };
    room.phase = 'showdown'; room.message = `Showcase Showdown! Closest to $1.00 without going over. ${room.players[top[0]].name} spins first.`; GR.gate(room, 'Showcase Showdown', [top.map(id => room.players[id].name).join(' · '), `${room.players[top[0]].name} spins first`]);
  }
  function spin(room, pid) {
    const s = room.showdown; if (!s || s.done || s.spinners[s.idx] !== pid) return { error: 'Not your spin' };
    if ((s.spins[pid] || 0) >= (s.spinoff ? 1 : 2)) return { error: 'No spins left' };
    const i = R(SHOWDOWN_WHEEL.length), v = SHOWDOWN_WHEEL[i]; s.rotation += 360 * 3 + ((-(i * 18) - s.rotation) % 360 + 720) % 360;
    s.spin = { i, value: v, at: Date.now(), rotation: s.rotation }; s.spins[pid] = (s.spins[pid] || 0) + 1; s.totals[pid] = (s.spinoff ? 0 : s.totals[pid] || 0) + v; s.last = v;
    const p = room.players[pid], t = s.totals[pid];
    if (t > 100) { room.message = `${p.name}: ${t}¢ — over a dollar!`; nextSpinner(room); }
    else if (t === 100) { p.winnings += 1000; room.message = `${p.name} hits $1.00! +$1,000!`; nextSpinner(room); }
    else if (s.spins[pid] >= (s.spinoff ? 1 : 2)) { room.message = `${p.name} finishes with ${t}¢.`; nextSpinner(room); }
    else room.message = `${p.name}: ${t}¢. Spin again or stay?`;
    return { ok: true, value: v };
  }
  function stay(room, pid) { const s = room.showdown; if (!s || s.done || s.spinners[s.idx] !== pid || !s.spins[pid]) return { error: 'Spin first' }; room.message = `${room.players[pid].name} stays at ${s.totals[pid]}¢.`; nextSpinner(room); return { ok: true }; }
  function nextSpinner(room) {
    const s = room.showdown; s.idx++; if (s.idx < s.spinners.length) return void (room.message += ` ${room.players[s.spinners[s.idx]].name}'s turn.`);
    const ok = s.spinners.filter(id => s.totals[id] <= 100); if (!ok.length) { s.done = true; room.message += ' Everyone went over!'; return; }
    const best = Math.max(...ok.map(id => s.totals[id])), tied = ok.filter(id => s.totals[id] === best);
    if (tied.length > 1) { s.spinners = tied; s.idx = 0; s.spinoff = true; tied.forEach(id => { s.spins[id] = 0; }); room.message += ` Tie at ${best}¢ — spin-off!`; return; }
    s.done = true; s.winner = tied[0]; room.message += ` ${room.players[tied[0]].name} wins the Showcase Showdown!`;
  }

  // ----- Final Showcase -----
  function startFinal(room) {
    const s = room.showdown; let ids = plist(room).sort((a, b) => b.winnings - a.winnings).map(p => p.id);
    if (s && s.winner) ids = [s.winner, ...ids.filter(x => x !== s.winner)];
    ids = ids.slice(0, 2); if (ids.length < 2) return { error: 'Need 2 players for the Showcase' };
    const items = [0, 1, 2, 3].map((_, i) => take(room, p => i === 0 ? p.price >= 200 : p.price >= 25));
    room.final = { players: ids, items, total: Math.round(items.reduce((a, b) => a + b.price, 0)), bids: {}, revealed: false, winner: null, both: false };
    room.phase = 'final'; room.message = `The Final Showcase! ${ids.map(id => room.players[id].name).join(' vs ')} — bid secretly on this package.`; GR.gate(room, 'The Final Showcase', [ids.map(id => room.players[id].name).join(' vs ')]); return { ok: true };
  }
  function finalBid(room, pid, amount) {
    const f = room.final; if (!f || f.revealed || !f.players.includes(pid)) return { error: 'Not your showcase' };
    if (f.bids[pid] !== undefined) return { error: 'Already bid' }; amount = Math.round(+amount); if (!Number.isFinite(amount) || amount < 1) return { error: 'Enter a bid' };
    f.bids[pid] = amount; room.message = `${room.players[pid].name} has locked in a bid.`;
    if (f.players.every(id => f.bids[id] !== undefined)) revealFinal(room); return { ok: true };
  }
  function revealFinal(room) {
    const f = room.final; f.revealed = true; const under = f.players.filter(id => f.bids[id] <= f.total).sort((a, b) => f.bids[b] - f.bids[a]);
    room.phase = 'over';
    if (!under.length) { room.message = `Actual retail price: ${money(f.total)}. Both players overbid — no winner!`; return; }
    const w = under[0], p = room.players[w]; f.winner = w; f.both = f.total - f.bids[w] <= SHOWCASE_RANGE; p.winnings += f.total * (f.both ? 2 : 1);
    room.message = `Actual retail price: ${money(f.total)}! ${p.name} wins the showcase${f.both ? ` — within $${SHOWCASE_RANGE}, BOTH showcases!` : '!'}`;
  }

  nsp.on('connection', socket => {
  GR.guard(socket, ev => ev.startsWith('host:') ? rooms[socket.data.hostCode] : rooms[socket.data.code]);

    const fail = m => socket.emit('errorMsg', m);
    const hostRoom = () => { const r = rooms[socket.data.hostCode]; return r && r.hostSocket === socket.id ? r : null; };
    const done = (room, res, cb) => { if (res && res.error) fail(res.error); cb && cb(res || {}); broadcast(room); };
    socket.on('host:mode', ({ mode } = {}) => { const room = hostRoom(); if (!room) return fail('Not hosting');
      room.hostMode = mode === 'dedicated' ? 'dedicated' : 'player'; broadcast(room); });
    socket.on('host:create', (opts, cb) => {
      if (typeof opts === 'function') { cb = opts; opts = {}; } const prev = opts && rooms[opts.code];
      if (prev && prev.hostKey === opts.hostKey) { prev.hostSocket = socket.id; socket.data.hostCode = prev.code; socket.join(prev.code); cb && cb({ code: prev.code, hostKey: prev.hostKey }); return broadcast(prev); }
      const c = makeCode(x => rooms[x]);
      rooms[c] = { code: c, hostKey: Math.random().toString(36).slice(2), hostSocket: socket.id, players: {}, phase: 'lobby', bidMode: 'secret', usedP: new Set(), row: null, game: null, showdown: null, final: null, message: 'Players: join on your phones!', created: Date.now() };
      socket.data.hostCode = c; socket.join(c); cb && cb({ code: c, hostKey: rooms[c].hostKey }); broadcast(rooms[c]);
    });
    socket.on('host:go', (_, cb) => { const room = hostRoom(); const went = !!(room && GR.go(room)); if (went) broadcast(room); if (typeof cb === 'function') cb(went ? { ok: true } : { error: 'Nothing to start' }); });
    socket.on('host:bidMode', ({ mode }) => { const room = hostRoom(); if (room) { room.bidMode = mode === 'sequential' ? 'sequential' : 'secret'; broadcast(room); } });
    socket.on('host:row', (_, cb) => { const room = hostRoom(); if (!room) return; if (Object.keys(room.players).length < 2) return done(room, { error: 'Need at least 2 players' }, cb); startRow(room); done(room, { ok: true }, cb); });
    socket.on('host:rebid', () => { const room = hostRoom(); const r = room && room.row; if (!r || !r.overbid) return; Object.assign(r, { bids: {}, revealed: false, overbid: false, turnIdx: 0 }); room.message = 'Bid again — everyone overbid last time!'; broadcast(room); });
    socket.on('host:closeBids', () => { const room = hostRoom(); const r = room && room.row; if (!r || r.revealed || !Object.keys(r.bids).length) return; revealRow(room); broadcast(room); });
    socket.on('host:game', ({ type } = {}, cb) => { const room = hostRoom(); if (room) done(room, startGame(room, type), cb); });
    socket.on('host:showdown', (_, cb) => { const room = hostRoom(); if (!room) return; if (Object.keys(room.players).length < 2) return done(room, { error: 'Need players' }, cb); startShowdown(room); done(room, { ok: true }, cb); });
    socket.on('host:final', (_, cb) => { const room = hostRoom(); if (room) done(room, startFinal(room), cb); });
    socket.on('host:adjust', ({ pid, delta }) => { const room = hostRoom(); const p = room && room.players[pid]; if (p) { p.winnings += Math.round(+delta || 0); broadcast(room); } });
    socket.on('host:newGame', () => { const room = hostRoom(); if (!room) return; clearTimeout(room.clockTimer); Object.values(room.players).forEach(p => { p.winnings = 0; p.played = false; }); Object.assign(room, { phase: 'lobby', row: null, game: null, showdown: null, final: null, message: 'New game!' }); broadcast(room); });

    socket.on('player:join', ({ code, name, pid }, cb) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 14);
      const room = rooms[code]; if (!room) return cb && cb({ error: 'No Price Is Right game with that code' }); if (!name) return cb && cb({ error: 'Enter a name' });
      pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2); let p = room.players[pid];
      if (!p) { if (Object.values(room.players).some(x => x.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'That name is taken' });
        if (Object.keys(room.players).length >= 12) return cb && cb({ error: 'Game is full' }); p = room.players[pid] = { id: pid, name, winnings: 0, played: false }; }
      p.socketId = socket.id; p.connected = true; socket.data.code = code; socket.data.pid = pid; socket.join(code); cb && cb({ ok: true, pid, code }); broadcast(room);
    });
    const me = () => { const r = rooms[socket.data.code]; return r && r.players[socket.data.pid] ? r : null; };
    socket.on('player:bid', ({ amount }, cb) => { const room = me(); if (room) done(room, rowBid(room, socket.data.pid, amount), cb); });
    socket.on('player:move', (m, cb) => { const room = me(); if (room) done(room, gameMove(room, socket.data.pid, m || {}), cb); });
    socket.on('player:spin', (_, cb) => { const room = me(); if (room) done(room, spin(room, socket.data.pid), cb); });
    socket.on('player:stay', (_, cb) => { const room = me(); if (room) done(room, stay(room, socket.data.pid), cb); });
    socket.on('player:finalBid', ({ amount }, cb) => { const room = me(); if (room) done(room, finalBid(room, socket.data.pid, amount), cb); });
    socket.on('disconnect', () => { const room = rooms[socket.data.code]; const p = room && room.players[socket.data.pid]; if (p && p.socketId === socket.id) { p.connected = false; p.socketId = null; broadcast(room); } });
  });
  setInterval(() => { for (const c in rooms) if (Date.now() - rooms[c].created > 12 * 3600e3) { clearTimeout(rooms[c].clockTimer); delete rooms[c]; } }, 3600e3).unref();
  return { rooms, PRODUCTS, SHOWDOWN_WHEEL, PLINKO };
};
module.exports.loadProducts = loadProducts;
