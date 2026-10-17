// Buzzwise: Family Feud mode (socket.io namespace /ff)
// The host only CONTROLS the game: unrevealed survey answers are never sent to any client.
const GR = require('./lib/getready');
const fs = require('fs'), path = require('path');
const STRIKES = 3, WIN_SCORE = 300, FM_TARGET = 200;
const T = () => ({ fm1: +(process.env.FF_FM1 || 20), fm2: +(process.env.FF_FM2 || 25) });

function loadSurveys() {
  const out = []; let cur = null;
  for (const raw of fs.readFileSync(path.join(__dirname, 'data', 'ff-surveys.txt'), 'utf8').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    if (l.startsWith('Q:')) { cur = { q: l.slice(2).trim(), answers: [] }; out.push(cur); continue; }
    const m = l.match(/^(.+?)\s*(?:=\s*(.+?))?\s*\|\s*(\d+)$/); if (!m || !cur) throw new Error('Bad survey line: ' + l);
    cur.answers.push({ text: m[1].trim(), aliases: [m[1], ...(m[2] ? m[2].split(',') : [])].map(s => s.trim()).filter(Boolean), points: +m[3] });
  }
  out.forEach(s => s.answers.sort((a, b) => b.points - a.points));
  // Merge generated per-answer alias lists (data/ff-aliases.json, built by scripts/gen-ff-aliases.js)
  let extra = {}; try { extra = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ff-aliases.json'), 'utf8')); } catch (e) {}
  out.forEach(s => { const m = extra[s.q] || {}; s.answers.forEach(a => { for (const al of m[a.text] || []) if (!a.aliases.includes(al)) a.aliases.push(al); }); });
  return out;
}
const STOP = new Set(['a', 'an', 'the', 'my', 'your', 'some', 'of', 'to', 'for', 'and', 'or', 'i', 'you', 'their', 'his', 'her', 'go', 'get', 'getting', 'going', 'having', 'be']);
const stem = w => w.length > 5 && /([^aeiou])\1ing$/.test(w) && !/(ll|ss)ing$/.test(w) ? w.slice(0, -4) : w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && /[^e]ed$/.test(w) && !/eed$/.test(w) ? w.slice(0, -2) : w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 4 && /(ches|shes|sses|xes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const tokens = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(stem);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Score how well guess matches an alias: 0 = exact, small = close, Infinity = no
function aliasDist(guess, alias) {
  const g = tokens(guess), a = tokens(alias); if (!g.length || !a.length) return Infinity;
  const gs = g.join(' '), as = a.join(' ');
  if (gs === as) return 0;
  if (a.every(w => g.includes(w)) && g.length <= a.length + 2) return 0.5; // guess contains alias words ("a big towel" -> towel)
  if (g.every(w => a.includes(w)) && g.includes(a[a.length - 1]) && g.join('').length >= 4) return 0.8;   // guess is a meaningful subset of a multi-word alias
  const near = (x, y) => x === y || (y.length >= 5 && lev(x, y) <= 1) || (y.length >= 8 && lev(x, y) <= 2);
  if (a.every(w => g.some(x => near(x, w))) && g.length <= a.length + 3) return 1.5; // word-level typo tolerance
  const d = lev(gs.replace(/ /g, ''), as.replace(/ /g, '')), L = as.replace(/ /g, '').length;
  return d <= (L <= 4 ? 0 : L <= 7 ? 1 : 2) ? 1 + d : 10 + d / Math.max(L, 1); // >=10 = not a match, but rankable for override
}
function bestMatch(guess, answers, exclude = new Set()) {
  let best = null;
  answers.forEach((ans, i) => { if (exclude.has(i)) return; const d = Math.min(...ans.aliases.map(al => aliasDist(guess, al))); if (!best || d < best.d) best = { i, d }; });
  return best;
}
const match = (guess, answers, exclude) => { const b = bestMatch(guess, answers, exclude); return b && b.d < 10 ? b.i : -1; };

module.exports = function attachFF(io, makeCode) {
  const nsp = io.of('/ff'); const rooms = {}; const SURVEYS = loadSurveys();
  const pick = room => { if (room.nextQ != null && !room.usedQ.has(room.nextQ)) { const i = room.nextQ; room.nextQ = null; room.usedQ.add(i); return SURVEYS[i]; } return pick0(room); };
  const peekNext = room => { if (room.nextQ == null || room.usedQ.has(room.nextQ)) { const pool = SURVEYS.map((_, i) => i).filter(i => !room.usedQ.has(i)); room.nextQ = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null; } return room.nextQ == null ? null : SURVEYS[room.nextQ]; };
  const pick0 = room => { if (process.env.FF_FIRST_Q && !room.usedQ.size) { const i = SURVEYS.findIndex(x => x.q.includes(process.env.FF_FIRST_Q)); if (i >= 0) { room.usedQ.add(i); return SURVEYS[i]; } } const pool = SURVEYS.map((_, i) => i).filter(i => !room.usedQ.has(i)); const i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 0; room.usedQ.add(i); return SURVEYS[i]; };
  const mult = n => n <= 2 ? 1 : n === 3 ? 2 : 3;
  const members = (room, t) => Object.values(room.players).filter(p => p.team === t);
  const other = t => 1 - t;

  function view(room) {
    const r = room.round, f = room.fm;
    return {
      code: room.code, phase: room.phase, teams: room.teams, maxRounds: room.maxRounds, message: room.message,
      players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, team: p.team, connected: p.connected, isHost: !!p.isHost })),
      round: r && {
        num: r.num, mult: r.mult, question: r.fullyRead || room.phase !== 'faceoff' ? r.survey.q : null, reading: !!r.reading, readSeq: r.readSeq || 0, fullyRead: !!r.fullyRead, pot: r.pot, strikes: r.strikes, control: r.control, faceoff: r.faceoff, buzzed: r.buzzed,
        faceoffAnswers: r.faceoffAnswers, foEndsAt: room.phase === 'faceoff' && r.buzzed ? r.foEndsAt : null, now: Date.now(), firstBuzz: r.firstBuzz || null, canOverride: !!r.lastMiss, winner: r.winner,
        board: r.survey.answers.map((a, i) => r.revealed.has(i) ? { n: i + 1, text: a.text, points: a.points } : { n: i + 1 }), // unrevealed = number only
      },
      fm: f && {
        stage: f.stage, players: f.players, qIndex: f.qIndex, endsAt: f.endsAt, now: Date.now(), total: f.total, dup: f.dup,
        questions: f.qs.map(s => s.q),
        rows: f.qs.map((s, qi) => [0, 1].map(pi => { const e = f.entries[pi][qi]; if (!e) return null;
          const shown = f.revealedPlayers.has(pi) && !(pi === 0 && f.stage === 'p2'); return shown ? { guess: e.guess, answer: e.idx >= 0 ? s.answers[e.idx].text : null, points: e.points } : { submitted: true }; })),
      },
    };
  }
  const broadcast = room => {
    if (room.getReady) return nsp.to(room.code).emit('state', GR.view(room, room.teams.map(t => ({ name: t.name, score: t.score }))));
    const v = view(room); v.hostMode = room.hostMode || 'player';
    if (!room.hostSocket) return nsp.to(room.code).emit('state', v);
    nsp.to(room.code).except(room.hostSocket).emit('state', v);
    const hv = { ...v };
    // the shared screen gets the question text ONLY to speak it (not displayed until one full reading)
    if (room.round && room.round.reading) hv.speak = room.round.survey.q;
    if (room.hostMode === 'dedicated') { // dedicated (non-playing) host also sees the full survey board
      if (room.round) hv.hostAnswers = room.round.survey.answers.map((a, i) => ({ n: i + 1, text: a.text, points: a.points, revealed: room.round.revealed.has(i) }));
      if (room.fm) hv.hostFm = room.fm.qs.map(s => s.answers.slice(0, 3).map(a => `${a.text} (${a.points})`).join(', '));
    }
    nsp.to(room.hostSocket).emit('state', hv);
  };
  // Face-off read-aloud (same rules as Jeopardy player-host): buzzers open during the reading, a buzz cuts it off,
  // the question shows only after one full uninterrupted reading, and a pass to the opponent is NOT re-read.
  const READ_MS = q => +(process.env.FF_READ_MS || Math.min(20000, 3500 + String(q).split(/\s+/).length * 500));
  function startReading(room) { const r = room.round; clearTimeout(r.readTimer); r.reading = true; r.readSeq = (r.readSeq || 0) + 1; const seq = r.readSeq;
    r.readTimer = setTimeout(() => { if (room.round === r && r.reading && r.readSeq === seq) { finishReading(room); broadcast(room); } }, READ_MS(r.survey.q)); }
  function finishReading(room) { const r = room.round; clearTimeout(r.readTimer); r.reading = false; r.fullyRead = true; }
  function strike(room, n) { nsp.to(room.code).emit('strike', { count: n }); }

  function newRound(room) {
    const num = (room.round ? room.round.num : 0) + 1;
    room.foIdx = room.foIdx.map((v, t) => (v + 1) % Math.max(1, members(room, t).length));
    const fo = [0, 1].map(t => { const m = members(room, t); return m.length ? m[room.foIdx[t] % m.length].id : null; });
    room.round = { num, mult: mult(num), survey: pick(room), revealed: new Set(), pot: 0, strikes: 0, control: null, faceoff: fo, buzzed: null, faceoffAnswers: [], lastMiss: null, winner: null, stealTeam: null };
    room.phase = 'faceoff'; GR.gate(room, `Round ${num}${room.round.mult > 1 ? ` · ${room.round.mult === 2 ? 'Double' : 'Triple'} points` : ''}`, [`Face-off: ${fo.map(id => id && `${room.players[id].name} (${room.teams[room.players[id].team].name})`).filter(Boolean).join(' vs ')}`, 'Hands on buzzers. The question is read when the host presses Start.'], () => startReading(room)); room.message = `Round ${num}${room.round.mult > 1 ? ` (${room.round.mult === 2 ? 'Double' : 'Triple'} points!)` : ''}: Face-off! ${fo.map(id => id && room.players[id].name).filter(Boolean).join(' vs ')} — buzz in!`;
  }
  function reveal(room, i) { const r = room.round; if (r.revealed.has(i)) return 0; r.revealed.add(i); r.pot += r.survey.answers[i].points; nsp.to(room.code).emit('ding', { n: i + 1 }); return r.survey.answers[i].points; }
  function endRound(room, team, why) {
    const r = room.round; const pts = r.pot * r.mult; room.teams[team].score += pts; r.winner = team;
    r.survey.answers.forEach((_, i) => r.revealed.add(i)); // round over: reveal everything left (no points)
    room.phase = 'roundEnd'; r.lastMiss = null;
    room.message = `${why} ${room.teams[team].name} win ${pts} points${r.mult > 1 ? ` (${r.pot} × ${r.mult})` : ''}!`;
    if (room.teams[team].score >= WIN_SCORE || r.num >= room.maxRounds) {
      const w = room.teams[0].score === room.teams[1].score ? team : room.teams[0].score > room.teams[1].score ? 0 : 1;
      room.phase = 'gameOver'; room.gameWinner = w; room.message += ` ${room.teams[w].name} win the game and play Fast Money!`;
    }
  }
  // Core: process a guess coming from host (on behalf of someone) or a player phone
  function guess(room, text, byPid) {
    const r = room.round; if (!r || !String(text || '').trim()) return { error: 'Empty answer' };
    const ans = r.survey.answers;
    if (room.phase === 'faceoff') {
      if (!r.buzzed) return { error: 'Nobody has buzzed' };
      clearTimeout(r.foTimer); const timedOut = text === TIMEOUT;
      const who = r.buzzed, team = room.players[who].team, i = timedOut ? -1 : match(text, ans, r.revealed);
      if (timedOut) text = "(time's up)";
      r.faceoffAnswers.push({ pid: who, team, guess: String(text).slice(0, 60), rank: i });
      if (i >= 0) reveal(room, i); else { r.lastMiss = { text, phase: 'faceoff' }; strike(room, 1); }
      const first = r.faceoffAnswers[0], second = r.faceoffAnswers[1];
      if (i === 0) return setControl(room, team, `${room.players[who].name} found the #1 answer!`);
      if (!second) { // other face-off player gets a shot
        r.buzzed = r.faceoff.find(id => id && id !== who) || null;
        if (!r.buzzed) return i >= 0 ? setControl(room, team, '') : (r.faceoffAnswers = [], room.message = 'No match. Buzz again!', {});
        room.message = i >= 0 ? `#${i + 1} on the board! ${room.players[r.buzzed].name}, can you beat it?` : `${timedOut ? "Time's up!" : 'Not on the board.'} ${room.players[r.buzzed].name}, your turn!`; armFaceoff(room); return { hit: i >= 0, index: i };
      }
      const a = first.rank < 0 ? 99 : first.rank, b = second.rank < 0 ? 99 : second.rank;
      if (a === 99 && b === 99) { r.faceoffAnswers = []; r.buzzed = null; r.firstBuzz = null; room.message = 'Neither answer is on the board. Buzz again!'; return { hit: false }; }
      return setControl(room, a <= b ? first.team : second.team, '');
    }
    if (room.phase === 'play') {
      if (byPid && room.players[byPid] && room.players[byPid].team !== r.control) return { error: "It's not your team's turn" };
      const i = match(text, ans, new Set()); // check revealed too, to catch repeats
      if (i >= 0 && r.revealed.has(i)) { room.message = `"${text}" is already on the board — try again.`; return { repeat: true }; }
      if (i >= 0) { reveal(room, i); r.lastMiss = null; room.message = `Survey says... #${i + 1}!`;
        if (r.revealed.size === ans.length) endRound(room, r.control, 'Board cleared!'); return { hit: true, index: i }; }
      r.strikes++; r.lastMiss = { text, phase: 'play' }; strike(room, r.strikes);
      if (r.strikes >= STRIKES) { r.revealedBeforeSteal = [...r.revealed]; room.phase = 'steal'; r.stealTeam = other(r.control); room.message = `Three strikes! ${room.teams[r.stealTeam].name}, one guess to steal ${r.pot} points.`; }
      else room.message = `Strike ${r.strikes}!`;
      return { hit: false };
    }
    if (room.phase === 'steal') {
      if (byPid && room.players[byPid] && room.players[byPid].team !== r.stealTeam) return { error: 'Only the stealing team can answer' };
      const i = match(text, ans, r.revealed);
      if (i >= 0) { reveal(room, i); endRound(room, r.stealTeam, 'Steal!'); return { hit: true, index: i }; }
      r.lastMiss = { text, phase: 'steal' }; strike(room, 1); endRound(room, r.control, 'Steal failed.'); r.lastMiss = { text, phase: 'stealFail' }; return { hit: false };
    }
    return { error: 'No question is open' };
  }
  // Face-off answer clock: a buzzed player who doesn't answer in time counts as a miss and play passes to the opponent.
  const TIMEOUT = '\u0000timeout', FO_MS = () => +(process.env.FF_FACEOFF_MS || 20000);
  function armFaceoff(room) { const r = room.round; clearTimeout(r.foTimer); if (!r.buzzed) return; r.foEndsAt = Date.now() + FO_MS();
    r.foTimer = setTimeout(() => { if (room.round === r && room.phase === 'faceoff' && r.buzzed) { guess(room, TIMEOUT, r.buzzed); broadcast(room); } }, FO_MS()); }
  function faceoffBuzz(room, pid) { // server judges by arrival order: first buzz wins, the other is locked out
    const r = room.round; if (!r || room.phase !== 'faceoff' || r.buzzed || !r.faceoff.includes(pid) || r.faceoffAnswers.some(x => x.pid === pid)) return { error: 'Locked out' };
    if (r.reading) { r.reading = false; clearTimeout(r.readTimer); } // a buzz cuts the reading off
    r.buzzed = pid; r.firstBuzz = r.firstBuzz || pid; room.message = `${room.players[pid].name} buzzed first!`; nsp.to(room.code).emit('buzz', { pid, name: room.players[pid].name }); armFaceoff(room); return { ok: true };
  }
  function setControl(room, team, msg) {
    const r = room.round; clearTimeout(r.foTimer); r.control = team; r.buzzed = null; room.phase = 'playpass';
    room.message = `${msg} ${room.teams[team].name} win the face-off: play or pass?`.trim(); return { hit: true };
  }
  function override(room) { // host confirmed "this should have counted": reveal best near-miss
    const r = room.round; if (!r || !r.lastMiss) return { error: 'Nothing to override' };
    const b = bestMatch(r.lastMiss.text, r.survey.answers, /steal/i.test(r.lastMiss.phase) ? new Set(r.revealedBeforeSteal || []) : r.revealed);
    const lm = r.lastMiss; r.lastMiss = null; if (!b) return { error: 'No candidate' };
    if (lm.phase === 'play') { r.strikes = Math.max(0, r.strikes - 1); reveal(room, b.i); room.message = `Override: counted as #${b.i + 1}.`; if (r.revealed.size === r.survey.answers.length) endRound(room, r.control, 'Board cleared!'); }
    else if (lm.phase === 'steal' || lm.phase === 'stealFail') { // undo the failed steal
      const t = r.stealTeam; room.teams[r.control].score -= r.pot * r.mult; if (room.phase === 'gameOver') room.phase = 'roundEnd';
      r.revealed = new Set(r.revealedBeforeSteal || []); r.pot = [...r.revealed].reduce((s, i) => s + r.survey.answers[i].points, 0);
      reveal(room, b.i); endRound(room, t, 'Override — steal counts!');
    } else if (lm.phase === 'faceoff') {
      const fa = r.faceoffAnswers.find(x => x.rank < 0 && x.guess === String(lm.text).slice(0, 60)); if (fa) fa.rank = b.i; reveal(room, b.i);
      room.message = `Override: counted as #${b.i + 1}.`;
      if (room.phase === 'faceoff' && r.faceoffAnswers.length >= 2) { const [x, y] = r.faceoffAnswers; setControl(room, (x.rank < 0 ? 99 : x.rank) <= (y.rank < 0 ? 99 : y.rank) ? x.team : y.team, ''); }
    }
    return { ok: true, index: b.i };
  }

  // ----- Fast Money -----
  function fmStart(room, p1, p2) {
    room.fm = { stage: 'ready1', players: [p1, p2], qs: Array.from({ length: 5 }, () => pick(room)), entries: [[], []], qIndex: 0, endsAt: null, total: 0, revealedPlayers: new Set(), dup: false, order: [] };
    room.phase = 'fm'; room.message = `Fast Money! ${room.players[p1].name} goes first (20 seconds). ${room.players[p2].name}, no peeking!`;
  }
  function fmBeginTurn(room) {
    const f = room.fm, pi = f.stage === 'ready1' ? 0 : 1; f.stage = pi ? 'p2' : 'p1'; f.qIndex = 0; f.order = [0, 1, 2, 3, 4]; f.dup = false;
    const secs = pi ? T().fm2 : T().fm1; f.endsAt = Date.now() + secs * 1000; clearTimeout(room.fmTimer);
    room.fmTimer = setTimeout(() => fmEndTurn(room), secs * 1000); room.message = `${room.players[f.players[pi]].name}: ${secs} seconds on the clock!`;
  }
  function fmEndTurn(room) {
    const f = room.fm; if (!f || (f.stage !== 'p1' && f.stage !== 'p2')) return; clearTimeout(room.fmTimer);
    const pi = f.stage === 'p1' ? 0 : 1; for (let q = 0; q < 5; q++) if (!f.entries[pi][q]) f.entries[pi][q] = { guess: '', idx: -1, points: 0 };
    f.revealedPlayers.add(pi); f.total = f.entries.flat().reduce((s, e) => s + (e ? e.points : 0), 0); f.endsAt = null;
    if (pi === 0) { f.stage = 'ready2'; room.message = `${room.players[f.players[0]].name} scored ${f.total}. ${room.players[f.players[1]].name} needs ${Math.max(0, FM_TARGET - f.total)}!`; }
    else { f.stage = 'done'; room.phase = 'fmDone'; room.message = f.total >= FM_TARGET ? `${f.total} points — FAST MONEY WIN! 🎉` : `${f.total} points. So close!`; }
    broadcast(room);
  }
  function fmAnswer(room, text, pass) {
    const f = room.fm, pi = f.stage === 'p1' ? 0 : f.stage === 'p2' ? 1 : -1; if (pi < 0) return { error: 'Not answering now' };
    const q = f.order[0]; if (q === undefined) return { error: 'All done' };
    if (pass) { f.order.push(f.order.shift()); f.qIndex = f.order[0]; return { passed: true }; }
    const s = f.qs[q], idx = match(text, s.answers);
    if (pi === 1) { const prev = f.entries[0][q]; if (prev && ((idx >= 0 && prev.idx === idx) || tokens(prev.guess).join(' ') === tokens(text).join(' '))) { f.dup = true; nsp.to(room.code).emit('dup'); return { duplicate: true }; } }
    f.dup = false; f.entries[pi][q] = { guess: String(text).slice(0, 40), idx, points: idx >= 0 ? s.answers[idx].points : 0 };
    f.order.shift(); f.qIndex = f.order[0] === undefined ? 5 : f.order[0];
    if (!f.order.length) fmEndTurn(room); return { ok: true };
  }

  nsp.on('connection', socket => {
  GR.guard(socket, ev => ev.startsWith('host:') ? rooms[socket.data.hostCode] : rooms[socket.data.code]);

    const fail = m => socket.emit('errorMsg', m);
    const hostRoom = () => { const r = rooms[socket.data.hostCode]; return r && r.hostSocket === socket.id ? r : null; };
    const done = (room, res, cb) => { if (res && res.error) fail(res.error); cb && cb(res || {}); broadcast(room); };
    socket.on('host:create', (opts, cb) => {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      const prev = opts && rooms[opts.code];
      if (prev && prev.hostKey === opts.hostKey) { prev.hostSocket = socket.id; socket.data.hostCode = prev.code; { const hp = prev.players['host-' + prev.code]; if (hp) { hp.socketId = socket.id; hp.connected = true; } } socket.join(prev.code); cb && cb({ code: prev.code, hostKey: prev.hostKey }); return broadcast(prev); }
      const c = makeCode(x => rooms[x]);
      const room = rooms[c] = { code: c, hostKey: Math.random().toString(36).slice(2), hostSocket: socket.id, players: {}, teams: [{ name: 'Team Red', score: 0 }, { name: 'Team Blue', score: 0 }],
        phase: 'lobby', round: null, fm: null, usedQ: new Set(), foIdx: [-1, -1], maxRounds: 5, message: 'Players: join and pick a team!', created: Date.now() };
      socket.data.hostCode = c; socket.join(c); cb && cb({ code: c, hostKey: room.hostKey }); broadcast(room);
    });
    socket.on('host:mode', ({ mode } = {}) => { const room = hostRoom(); if (!room) return;
      if (mode === 'dedicated' && room.phase !== 'lobby' && room.players['host-' + room.code]) return fail("You're playing on a team, so answers stay hidden until the game ends (New game to switch).");
      room.hostMode = mode === 'dedicated' ? 'dedicated' : 'player';
      if (room.hostMode === 'dedicated' && room.phase === 'lobby') delete room.players['host-' + room.code]; // a host who sees answers can't play
      broadcast(room); });
    socket.on('host:settings', ({ teamNames, maxRounds } = {}) => { const room = hostRoom(); if (!room) return;
      if (Array.isArray(teamNames)) teamNames.forEach((n, i) => { if (n && room.teams[i]) room.teams[i].name = String(n).slice(0, 20); });
      if (maxRounds) room.maxRounds = Math.max(1, Math.min(10, +maxRounds)); broadcast(room); });
    socket.on('host:startRound', () => { const room = hostRoom(); if (!room) return;
      if ([0, 1].some(t => !members(room, t).length)) return fail('Each team needs at least one player');
      if (!['lobby', 'roundEnd'].includes(room.phase)) return fail('Finish the current round first');
      newRound(room); broadcast(room); });
    // Player-host mode: the host joins a team from the host screen and plays (face-offs, guesses, Fast Money) while running the board.
    socket.on('host:joinTeam', ({ name, team } = {}, cb) => { const room = hostRoom(); if (!room) return;
      if (room.hostMode === 'dedicated') return done(room, { error: 'A dedicated host cannot play. Switch to Player host first.' }, cb);
      if (![0, 1].includes(+team)) return done(room, { error: 'Pick a team' }, cb);
      const pid = 'host-' + room.code; let p = room.players[pid]; name = String(name || (p && p.name) || 'Host').trim().slice(0, 14) || 'Host';
      if (Object.values(room.players).some(x => x.id !== pid && x.name.toLowerCase() === name.toLowerCase())) return done(room, { error: 'That name is taken' }, cb);
      if (p && room.phase !== 'lobby' && p.team !== +team) return done(room, { error: 'Teams can only change in the lobby' }, cb);
      if (!p) p = room.players[pid] = { id: pid, name, team: +team, isHost: true }; p.name = name; p.team = +team; p.socketId = socket.id; p.connected = true;
      done(room, { ok: true, pid }, cb); });
    socket.on('host:leaveTeam', () => { const room = hostRoom(); if (!room || room.phase !== 'lobby') return; delete room.players['host-' + room.code]; broadcast(room); });
    socket.on('host:go', (_, cb) => { const room = hostRoom(); const went = !!(room && GR.go(room)); if (went) broadcast(room); if (typeof cb === 'function') cb(went ? { ok: true } : { error: 'Nothing to start' }); });
    socket.on('host:readDone', ({ seq } = {}) => { const room = hostRoom(); const r = room && room.round; if (!r || !r.reading || (seq && seq !== r.readSeq)) return; finishReading(room); broadcast(room); });
    socket.on('host:reread', () => { const room = hostRoom(); const r = room && room.round; if (!r || room.phase !== 'faceoff' || r.fullyRead || r.buzzed) return; startReading(room); broadcast(room); });
    socket.on('host:guess', ({ text }, cb) => { const room = hostRoom(); if (!room) return; done(room, guess(room, text, null), cb); });
    socket.on('host:override', (_, cb) => { const room = hostRoom(); if (!room) return; done(room, override(room), cb); });
    socket.on('host:buzzFor', ({ pid } = {}, cb) => { const room = hostRoom(); if (!room) return; const res = faceoffBuzz(room, pid); cb && cb(res); broadcast(room); });
    socket.on('host:playPass', ({ choice }) => { const room = hostRoom(); if (room) playPass(room, choice); });
    socket.on('host:adjust', ({ team, delta }) => { const room = hostRoom(); if (!room || !room.teams[team]) return; room.teams[team].score += Math.round(+delta || 0); broadcast(room); });
    socket.on('host:skipRound', () => { const room = hostRoom(); if (!room || !room.round) return; clearTimeout(room.round.foTimer); clearTimeout(room.round.readTimer); room.round.reading = false; room.round.survey.answers.forEach((_, i) => room.round.revealed.add(i)); room.phase = 'roundEnd'; room.message = 'Round skipped.'; broadcast(room); });
    socket.on('host:fastMoney', ({ p1, p2 } = {}) => { const room = hostRoom(); if (!room) return;
      const t = room.gameWinner !== undefined ? room.gameWinner : (room.teams[0].score >= room.teams[1].score ? 0 : 1); const m = members(room, t);
      const a = room.players[p1] ? p1 : m[0] && m[0].id, b = room.players[p2] ? p2 : (m[1] || m[0] || {}).id;
      if (!a || !b) return fail('Need players for Fast Money'); fmStart(room, a, b); broadcast(room); });
    socket.on('host:fmGo', () => { const room = hostRoom(); const f = room && room.fm; if (!f || !['ready1', 'ready2'].includes(f.stage)) return; fmBeginTurn(room); broadcast(room); });
    socket.on('host:fmAnswer', ({ text, pass }, cb) => { const room = hostRoom(); if (!room || !room.fm) return; done(room, fmAnswer(room, text, pass), cb); });
    socket.on('host:fmStop', () => { const room = hostRoom(); if (room && room.fm) fmEndTurn(room); });
    socket.on('host:newGame', () => { const room = hostRoom(); if (!room) return; clearTimeout(room.fmTimer); if (room.round) clearTimeout(room.round.foTimer); room.teams.forEach(t => t.score = 0); Object.assign(room, { phase: 'lobby', round: null, fm: null, gameWinner: undefined, message: 'New game! Pick teams.' }); broadcast(room); });

    function playPass(room, choice) {
      const r = room.round; if (room.phase !== 'playpass') return;
      if (choice === 'pass') r.control = other(r.control);
      room.phase = 'play'; r.strikes = 0; r.revealedBeforeSteal = null; room.message = `${room.teams[r.control].name} are playing! Give your answers.`; broadcast(room);
    }

    socket.on('player:join', ({ code, name, pid, team }, cb) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 14);
      const room = rooms[code]; if (!room) return cb && cb({ error: 'No Family Feud game with that code' });
      if (!name) return cb && cb({ error: 'Enter a name' });
      pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2);
      let p = room.players[pid];
      if (!p) { if (Object.values(room.players).some(x => x.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'That name is taken' });
        if (Object.keys(room.players).length >= 16) return cb && cb({ error: 'Game is full' });
        p = room.players[pid] = { id: pid, name, team: [0, 1].includes(+team) ? +team : (members(room, 0).length <= members(room, 1).length ? 0 : 1) }; }
      else if ([0, 1].includes(+team) && room.phase === 'lobby') p.team = +team;
      p.socketId = socket.id; p.connected = true; socket.data.code = code; socket.data.pid = pid; socket.join(code);
      cb && cb({ ok: true, pid, code }); broadcast(room);
    });
    const me = () => { const r = rooms[socket.data.code]; return r && r.players[socket.data.pid] ? r : null; };
    socket.on('player:team', ({ team }) => { const room = me(); if (room && room.phase === 'lobby' && [0, 1].includes(+team)) { room.players[socket.data.pid].team = +team; broadcast(room); } });
    socket.on('player:buzz', (_, cb) => { const room = me(); if (!room) return; const res = faceoffBuzz(room, socket.data.pid); if (typeof cb === 'function') cb(res); if (res.ok) broadcast(room); });
    socket.on('player:guess', ({ text }, cb) => { const room = me(); if (!room) return; const r = room.round, pid = socket.data.pid;
      if (room.phase === 'faceoff' && (!r || r.buzzed !== pid)) return cb && cb({ error: 'Buzz in first' });
      done(room, guess(room, text, pid), cb); });
    socket.on('player:playPass', ({ choice }) => { const room = me(); const r = room && room.round;
      if (r && room.phase === 'playpass' && room.players[socket.data.pid].team === r.control) playPass(room, choice); });
    socket.on('player:fmAnswer', ({ text, pass }, cb) => { const room = me(); const f = room && room.fm; if (!f) return;
      const pi = f.stage === 'p1' ? 0 : f.stage === 'p2' ? 1 : -1; if (pi < 0 || f.players[pi] !== socket.data.pid) return cb && cb({ error: 'Not your turn' });
      done(room, fmAnswer(room, text, pass), cb); });
    socket.on('disconnect', () => { const room = rooms[socket.data.code]; const p = room && room.players[socket.data.pid];
      if (p && p.socketId === socket.id) { if (room.phase === 'lobby') delete room.players[p.id]; /* left before the game: drop from the lobby list */ else { p.connected = false; p.socketId = null; } broadcast(room); } });
  });
  setInterval(() => { for (const c in rooms) if (Date.now() - rooms[c].created > 12 * 3600e3) { clearTimeout(rooms[c].fmTimer); delete rooms[c]; } }, 3600e3).unref();
  // read-aloud text for the host screen: current face-off question, or the next one (pre-fetch) once a game is under way
  const ttsText = q => { const room = rooms[String(q.room || '').toUpperCase()]; if (!room || room.hostKey !== q.key) return null;
    if (q.next) { if (!room.round) return null; const s = peekNext(room); return s ? s.q : null; }
    return room.round ? room.round.survey.q : null; };
  return { rooms, SURVEYS, ttsText };
};
// Built-in synonym map: expand an alias by swapping any word/phrase for its synonyms
const SYN = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ff-synonyms.json'), 'utf8')).groups; } catch (e) { return []; } })();
function synonymAliases(alias) {
  const t = ' ' + tokens(alias).join(' ') + ' ', out = new Set();
  for (const grp of SYN) {
    const forms = grp.map(w => tokens(w).join(' ')).filter(Boolean);
    for (const f of forms) if (t.includes(' ' + f + ' ')) for (const o of forms) if (o !== f) { const r = t.replace(' ' + f + ' ', ' ' + o + ' ').trim(); if (!/\b(\w+) \1\b/.test(r)) out.add(r); }
  }
  return [...out];
}
Object.assign(module.exports, { loadSurveys, match, bestMatch, tokens, aliasDist, synonymAliases, stem });
