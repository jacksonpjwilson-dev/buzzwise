// MyGameShow: Priorities (namespace /pri). The subject's private ranking is sent ONLY to the subject
// (and a dedicated host) until the reveal; guesses stay private until the reveal too.
const fs = require('fs'), path = require('path'); const makeParty = require('./lib/party'); const { shuffle } = makeParty;
const loadItems = () => fs.readFileSync(path.join(__dirname, 'data', 'priorities-items.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const PER_SPOT = 2, PERFECT = 5;
module.exports = function attachPRI(io, makeCode) {
  const ITEMS = loadItems();
  const order = room => Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id);
  const validPerm = o => Array.isArray(o) && o.length === 5 && new Set(o).size === 5 && o.every(i => Number.isInteger(i) && i >= 0 && i < 5);
  const guessers = room => order(room).filter(id => id !== room.round.subject && room.players[id].connected !== false);
  const score = (rank, guess) => { const hits = guess.filter((x, i) => x === rank[i]).length; return { hits, points: hits * PER_SPOT + (hits === 5 ? PERFECT : 0) }; };
  function startRound(room) {
    const ids = order(room); if (room.roundIdx >= ids.length * room.cycles) { room.phase = 'gameOver'; room.round = null; room.message = 'Game over!'; return; }
    let pool = ITEMS.filter(x => !room.used.has(x)); if (pool.length < 5) { room.used.clear(); pool = ITEMS; }
    const items = shuffle(pool).slice(0, 5); items.forEach(x => room.used.add(x));
    room.round = { subject: ids[room.roundIdx % ids.length], items, rank: null, guesses: {}, results: null };
    room.phase = 'ranking'; room.message = `${room.players[room.round.subject].name} is ranking 5 things in secret…`;
    api.gate(room, `Round ${room.roundIdx + 1} of ${ids.length * room.cycles}`, [`Subject: ${room.players[room.round.subject].name}`, room.guessMode === 'team' ? 'Everyone else guesses as one team' : 'Everyone else guesses on their own phone']);
  }
  function reveal(room) { const r = room.round; if (!r || room.phase !== 'guessing') return { error: 'Nothing to reveal' };
    r.results = {};
    if (room.guessMode === 'team') { const g = r.guesses.team; const s = g ? score(r.rank, g.order) : { hits: 0, points: 0 };
      r.results.team = { ...s, order: g ? g.order : null, by: g && g.by }; if (s.points) guessers(room).forEach(id => room.players[id].score += s.points); }
    else for (const [id, g] of Object.entries(r.guesses)) { const s = score(r.rank, g.order); r.results[id] = { ...s, order: g.order }; if (room.players[id]) room.players[id].score += s.points; }
    room.phase = 'reveal'; room.message = 'The reveal!'; return { ok: true };
  }
  const pubRound = (room, pid, isHostDedicated) => { const r = room.round; if (!r) return null;
    const show = room.phase === 'reveal' || r.subject === pid || (isHostDedicated && r.rank);
    return { subject: r.subject, items: r.items, rank: show ? r.rank : null, ranked: !!r.rank,
      submitted: room.guessMode === 'team' ? (r.guesses.team ? ['team'] : []) : Object.keys(r.guesses),
      teamGuess: room.guessMode === 'team' && r.guesses.team ? { by: r.guesses.team.by, order: pid && pid !== r.subject ? r.guesses.team.order : room.phase === 'reveal' ? r.guesses.team.order : null } : null,
      myGuess: pid && r.guesses[pid] ? r.guesses[pid].order : null, results: room.phase === 'reveal' ? r.results : null }; };
  let api;
  const game = {
    title: 'Priorities',
    init(room, a) { api = a; Object.assign(room, { guessMode: 'individual', cycles: 1, roundIdx: 0, round: null, used: new Set() }); },
    hostView(room) { return { guessMode: room.guessMode, cycles: room.cycles, roundNo: room.roundIdx + 1, totalRounds: Object.keys(room.players).length * room.cycles, perSpot: PER_SPOT, perfect: PERFECT, itemCount: ITEMS.length,
      round: pubRound(room, null, room.hostMode === 'dedicated') }; },
    playerView(room, pid) { return { ...game.hostView(room), round: pubRound(room, pid, false) }; },
    host: {
      settings(room, { guessMode, cycles }) { if (room.phase !== 'lobby' && room.phase !== 'gameOver') return { error: 'Settings are locked during a game' };
        if (['team', 'individual'].includes(guessMode)) room.guessMode = guessMode; if (cycles) room.cycles = Math.max(1, Math.min(5, +cycles)); },
      start(room) { if (Object.keys(room.players).length < 2) return { error: 'Need at least 2 players' }; Object.values(room.players).forEach(p => p.score = 0); room.roundIdx = 0; startRound(room); },
      reveal(room) { return reveal(room); },
      next(room) { if (room.phase !== 'reveal') return { error: 'Reveal first' }; room.roundIdx++; startRound(room); },
      skip(room) { if (!room.round) return { error: 'No round' }; room.roundIdx++; startRound(room); },
      newGame(room) { Object.assign(room, { phase: 'lobby', round: null, roundIdx: 0, message: 'New game!' }); Object.values(room.players).forEach(p => p.score = 0); },
    },
    player: {
      rank(room, pid, { order: o }) { const r = room.round; if (!r || room.phase !== 'ranking' || r.subject !== pid) return { error: 'Not your turn to rank' };
        if (!validPerm(o)) return { error: 'Rank all 5 items' }; r.rank = o; room.phase = 'guessing';
        room.message = room.guessMode === 'team' ? `Everyone else: agree on ${room.players[pid].name}'s order and send ONE guess!` : `Guess ${room.players[pid].name}'s order on your phone!`; return { ok: true }; },
      guess(room, pid, { order: o }) { const r = room.round; if (!r || room.phase !== 'guessing' || r.subject === pid) return { error: "You can't guess right now" };
        if (!validPerm(o)) return { error: 'Order all 5 items' };
        if (room.guessMode === 'team') { if (r.guesses.team) return { error: 'Your team already locked in a guess' }; r.guesses.team = { by: pid, order: o }; return reveal(room); }
        r.guesses[pid] = { order: o }; if (guessers(room).every(id => r.guesses[id])) reveal(room); return { ok: true }; },
    },
  };
  const p = makeParty(io, makeCode, '/pri', game); p.ITEMS = ITEMS; return p;
};
module.exports.loadItems = loadItems;
