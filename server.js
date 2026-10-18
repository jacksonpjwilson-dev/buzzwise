const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const GR = require('./lib/getready');

const BOARDS = require('./data/questions.json');
const PORT = process.env.PORT || 3000;
const VALUES = [[200, 400, 600, 800, 1000], [400, 800, 1200, 1600, 2000]];
const DIFFS = ['easy', 'medium', 'hard', 'expert'];

const app = express();
const PKG_VERSION = require('./package.json').version;
const COMMIT = (process.env.RENDER_GIT_COMMIT || (() => { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })()).slice(0, 7);
const VERSION = { version: PKG_VERSION, commit: COMMIT || 'dev', label: `v${PKG_VERSION} · ${COMMIT || 'dev'}` };
app.get('/version', (req, res) => res.json(VERSION));
app.get('/healthz', (req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/boards', (req, res) => res.json(BOARDS.map(b => ({
  id: b.id, name: b.name, difficulty: b.difficulty, tagline: b.tagline,
  categories: b.rounds.map(r => r.map(c => c.name)),
}))));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

app.get('/wof', (req, res) => res.sendFile(path.join(__dirname, 'public', 'wof-host.html')));
app.get('/ff', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ff-host.html')));
app.get('/ff/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ff-play.html')));
app.get('/pir', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pir-host.html')));
app.get('/pir/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pir-play.html')));
for (const g of ['pw', 'cae', 'pri']) { app.get('/' + g, (req, res) => res.sendFile(path.join(__dirname, 'public', g + '-host.html'))); app.get(`/${g}/play`, (req, res) => res.sendFile(path.join(__dirname, 'public', g + '-play.html'))); }
app.get('/wof/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'wof-play.html')));

app.get('/api/exists', (req, res) => { // lets /play pages drop stale saved sessions
  const code = String(req.query.code || '').trim().toUpperCase(), g = { jp: rooms, ff: ff.rooms, wof: wof.rooms, pir: pir.rooms, pw: pw.rooms, cae: cae.rooms, pri: pri.rooms }[req.query.game];
  res.json({ exists: !!(g && g[code]) });
});
app.get('/api/find', (req, res) => { // home-page "Join with code": which game owns this code?
  const code = String(req.query.code || '').trim().toUpperCase(), all = { jp: rooms, wof: wof.rooms, ff: ff.rooms, pir: pir.rooms, pw: pw.rooms, cae: cae.rooms, pri: pri.rooms };
  const game = Object.keys(all).find(k => all[k] && all[k][code]) || null; res.json({ game });
});
// Neural read-aloud: the host screen asks for audio by room + hostKey (+ optional clue id); never arbitrary text.
require('./lib/tts').mount(app, {
  jp: q => { const room = rooms[String(q.room || '').toUpperCase()]; if (!room || room.hostKey !== q.key || !room.board) return null;
    if (q.clue) { const [rd, c, r] = String(q.clue).split('-').map(Number); const cat = room.board.rounds[rd] && room.board.rounds[rd][c]; const cl = cat && cat.clues[r];
      return cl && rd === room.round && !room.used.has(`${rd}-${c}-${r}`) || (cl && room.current && room.current.round === rd && room.current.c === c && room.current.r === r) ? cl.q : null; }
    const cur = room.current; return cur ? room.board.rounds[cur.round][cur.c].clues[cur.r].q : null; },
  ff: q => ff.ttsText(q),
});
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, pingInterval: 20000, pingTimeout: 25000 }); // works behind HTTPS proxies (Render/Railway/Fly) as wss://
const rooms = {};
const codeMaker = exists => { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c;
  do { c = Array.from({ length: 5 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (exists(c) || rooms[c]); return c; };
const wof = require('./wof')(io, codeMaker);
const ff = require('./ff')(io, codeMaker);
const pir = require('./pir')(io, codeMaker);
const pw = require('./pw')(io, codeMaker);
const cae = require('./cae')(io, codeMaker);
const pri = require('./pri')(io, codeMaker);

function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c;
  do { c = Array.from({ length: 5 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms[c]);
  return c;
}
function pickDD(count) {
  const s = new Set();
  while (s.size < count) s.add(`${Math.floor(Math.random() * 6)}-${1 + Math.floor(Math.random() * 4)}`); // never the cheapest row
  return s;
}
const playersList = room => Object.values(room.players).map(p => ({ id: p.id, name: p.name, score: room.teamMode ? teamOf(room, p.id).score || 0 : p.score, connected: p.connected, team: p.team || null }));
// ---------- Teams mode ----------
const TEAM_DEFAULTS = [['Red Team', '#ff4d6d'], ['Blue Team', '#3da5ff'], ['Green Team', '#3ddc84'], ['Gold Team', '#ffcc00']];
const makeTeams = n => TEAM_DEFAULTS.slice(0, Math.min(4, Math.max(2, n | 0))).map(([name, color], i) => ({ id: 't' + (i + 1), name, color, score: 0 }));
const teamOf = (room, pid) => { const p = room.players[pid]; return (p && room.teams.find(t => t.id === p.team)) || {}; };
const teamMembers = (room, tid) => Object.values(room.players).filter(p => p.team === tid);
const activeTeams = room => room.teams.filter(t => teamMembers(room, t.id).length);
function smallestTeam(room) { return [...room.teams].sort((a, b) => teamMembers(room, a.id).length - teamMembers(room, b.id).length)[0]; }
function award(room, pid, delta) { const p = room.players[pid]; if (!p) return; if (room.teamMode) { const t = teamOf(room, pid); if (t.id) t.score += delta; } else p.score += delta; }
const scoreOf = (room, pid) => room.teamMode ? teamOf(room, pid).score || 0 : (room.players[pid] || {}).score || 0;
const teamsView = room => room.teamMode ? room.teams.map(t => ({ ...t, members: teamMembers(room, t.id).map(p => ({ id: p.id, name: p.name, connected: p.connected })) })) : null;
const standings = room => room.teamMode ? activeTeams(room).map(t => ({ name: t.name, score: t.score })) : Object.values(room.players).map(p => ({ name: p.name, score: p.score }));

function hostView(room) {
  const b = room.board, rd = typeof room.round === 'number' ? room.round : null;
  return {
    code: room.code, phase: room.phase, round: room.round, controller: room.controller,
    board: b ? { id: b.id, name: b.name, difficulty: b.difficulty } : null,
    grid: rd !== null ? b.rounds[rd].map((c, ci) => ({ name: c.name, clues: c.clues.map((_, ri) => ({ value: VALUES[rd][ri], used: room.used.has(`${rd}-${ci}-${ri}`) })) })) : null,
    hostMode: room.hostMode, teamMode: room.teamMode, teams: teamsView(room), ctrlTeam: room.ctrlTeam,
    current: room.current && hostCurrent(room),
    final: room.final && { ...room.final, category: b.final.category, clue: b.final.clue,
      answer: room.hostMode === 'player' && room.final.stage !== 'judge' && room.final.stage !== 'done' ? undefined : b.final.answer },
    players: playersList(room),
  };
}
// Player-host mode: the shared screen never shows clue text; it only gets the text to read aloud (speak) and
// receives the answer once it is revealed (correct / nobody / time-up).
function hostCurrent(room) {
  const cur = room.current, cl = room.board.rounds[cur.round][cur.c].clues[cur.r];
  const { timer, ...rest } = cur;
  const v = { ...rest, locked: [...cur.locked] };
  if (room.hostMode !== 'player') v.clue = cl;
  else { v.speak = cur.wager === null && cur.dd ? null : cl.q; v.clue = cur.revealed || cur.fullyRead ? { q: cur.fullyRead || cur.revealed ? cl.q : undefined, a: cur.revealed ? cl.a : undefined } : null; }
  return v;
}
function playerView(room, pid) {
  const cur = room.current, fin = room.final;
  return {
    code: room.code, phase: room.phase, round: room.round, controller: room.controller,
    boardName: room.board && room.board.name,
    grid: typeof room.round === 'number' ? room.board.rounds[room.round].map((c, ci) => ({ name: c.name, clues: c.clues.map((_, ri) => ({ value: VALUES[room.round][ri], used: room.used.has(`${room.round}-${ci}-${ri}`) })) })) : null,
    open: cur ? { c: cur.c, r: cur.r } : null,
    current: cur && { category: room.board.rounds[cur.round][cur.c].name, value: cur.value, dd: cur.dd, ddPlayer: cur.ddPlayer, wager: cur.wager,
      buzzOpen: cur.buzzOpen, buzzed: cur.buzzed, lockedOut: cur.locked.has(pid), revealed: cur.revealed, reading: !!cur.reading, peeked: cur.peeked && cur.buzzed === pid, result: cur.result || null,
      answer: room.hostMode === 'player' && ((cur.peeked && cur.buzzed === pid) || cur.revealed) ? room.board.rounds[cur.round][cur.c].clues[cur.r].a : undefined },
    hostMode: room.hostMode, teamMode: room.teamMode, teams: teamsView(room), ctrlTeam: room.ctrlTeam,
    final: fin && { category: room.board.final.category, stage: fin.stage, myWager: fin.wagers[fkey(room, pid)], myAnswer: fin.answers[fkey(room, pid)],
      wageredBy: room.teamMode ? nameOf(room, fin.by[fkey(room, pid) + ':w']) : undefined, answeredBy: room.teamMode ? nameOf(room, fin.by[fkey(room, pid) + ':a']) : undefined,
      wagered: Object.keys(fin.wagers).length, answered: Object.keys(fin.answers).length,
      revealed: null },
    me: room.players[pid] ? { id: pid, name: room.players[pid].name, score: scoreOf(room, pid), team: room.players[pid].team || null } : null,
    players: playersList(room),
  };
}
const fkey = (room, pid) => room.teamMode ? (room.players[pid] || {}).team : pid; // Final Jeopardy is keyed by team in Teams mode
const nameOf = (room, pid) => pid && room.players[pid] ? room.players[pid].name : null;
function broadcast(room) {
  if (room.getReady) { const v = GR.view(room, standings(room).sort((a, b) => b.score - a.score));
    if (room.hostSocket) io.to(room.hostSocket).emit('state', v); for (const p of Object.values(room.players)) if (p.socketId) io.to(p.socketId).emit('state', v); return; }
  if (room.hostSocket) io.to(room.hostSocket).emit('state', hostView(room));
  for (const p of Object.values(room.players)) if (p.socketId) io.to(p.socketId).emit('state', playerView(room, p.id));
}
function roundDone(room) {
  return [...Array(30).keys()].every(i => room.used.has(`${room.round}-${Math.floor(i / 5)}-${i % 5}`));
}
const READ_FALLBACK = q => Math.min(25000, 4000 + String(q).split(/\s+/).length * 500); // if the host's speech never reports back
const BUZZ_WINDOW = () => +(process.env.JP_BUZZ_MS || 12000); // player mode: nobody buzzes in this long -> reveal
function clearT(cur) { if (cur && cur.timer) { clearTimeout(cur.timer); cur.timer = null; } }
function openBuzzers(room) {
  const cur = room.current; if (!cur) return; clearT(cur); cur.reading = false;
  const remaining = Object.values(room.players).filter(x => x.connected && !cur.locked.has(x.id));
  cur.buzzOpen = remaining.length > 0;
  if (!cur.buzzOpen) return revealAll(room, 'nobody');
  if (room.hostMode === 'player') cur.timer = setTimeout(() => { if (room.current === cur && cur.buzzOpen && !cur.buzzed) { revealAll(room, 'timeout'); broadcast(room); } }, BUZZ_WINDOW());
}
function revealAll(room, why) { const cur = room.current; clearT(cur); cur.buzzOpen = false; cur.buzzed = null; cur.revealed = true; cur.result = cur.result || { why }; }
// Player mode: buzzers are OPEN while the clue is read. A buzz interrupts the reading; a Wrong restarts it from the start.
// The clue text appears on the shared screen only after one complete, uninterrupted reading (then stays).
function startReading(room) {
  const cur = room.current; clearT(cur); cur.reading = true; cur.readSeq = (cur.readSeq || 0) + 1;
  const remaining = Object.values(room.players).filter(x => x.connected && !cur.locked.has(x.id));
  cur.buzzOpen = !cur.dd && remaining.length > 0;
  const q = room.board.rounds[cur.round][cur.c].clues[cur.r].q, seq = cur.readSeq;
  cur.timer = setTimeout(() => { if (room.current === cur && cur.reading && cur.readSeq === seq) { finishReading(room); broadcast(room); } }, +(process.env.JP_READ_MS || READ_FALLBACK(q)));
}
function finishReading(room) {
  const cur = room.current; clearT(cur); cur.reading = false; cur.fullyRead = true;
  if (cur.dd) return;
  openBuzzers(room);
}
function judge(room, correct) {
  const cur = room.current, p = room.players[cur.buzzed], amt = cur.dd ? cur.wager : cur.value;
  if (p) award(room, cur.buzzed, correct ? amt : -amt);
  if (correct) { room.controller = cur.buzzed; if (room.teamMode) room.ctrlTeam = p.team; cur.result = { pid: cur.buzzed, correct: true };
    if (room.hostMode === 'player') { clearT(cur); cur.revealed = true; cur.buzzOpen = false; } else { cur.revealed = true; closeClue(room); } }
  else if (cur.dd) { if (room.hostMode === 'player') revealAll(room, 'wrong'); else { cur.revealed = true; closeClue(room); } }
  else { cur.locked.add(cur.buzzed); cur.buzzed = null; cur.peeked = false;
    if (room.hostMode === 'player') { const left = Object.values(room.players).some(x => x.connected && !cur.locked.has(x.id));
      if (left) startReading(room); else revealAll(room, 'nobody'); }
    else { const remaining = Object.values(room.players).filter(x => x.connected && !cur.locked.has(x.id)); cur.buzzOpen = remaining.length > 0; } }
}
function closeClue(room) {
  const cur = room.current; clearT(cur); room.used.add(`${cur.round}-${cur.c}-${cur.r}`); room.current = null;
  room.phase = roundDone(room) ? 'roundEnd' : 'board';
}

// picker: the player who chose the square from their phone (Teams mode); otherwise the host clicked it
function openClue(room, c, r, picker) {
  const key = `${room.round}-${c}-${r}`;
  if (!(Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < 6 && r >= 0 && r < 5) || room.used.has(key)) return 'That clue is gone';
  const dd = room.dd.has(`${c}-${r}`);
  let ddPlayer = null;
  if (dd) { if (picker) ddPlayer = picker;
    else if (room.teamMode) { const ctl = room.players[room.controller]; ddPlayer = ctl && ctl.team === room.ctrlTeam ? ctl.id : null; } // host picks a teammate otherwise
    else ddPlayer = room.players[room.controller] ? room.controller : null; }
  room.current = { round: room.round, c, r, value: VALUES[room.round][r], dd, buzzOpen: !dd, buzzed: null, locked: new Set(), revealed: false,
    ddPlayer, pickedBy: picker || null, wager: null, reading: false, peeked: false };
  room.phase = 'clue';
  if (room.hostMode === 'player' && !dd) startReading(room);
  broadcast(room); return null;
}
io.on('connection', socket => {
  GR.guard(socket, ev => ev.startsWith('host:') ? rooms[socket.data.hostCode] : rooms[socket.data.code]);

  const fail = msg => socket.emit('errorMsg', msg);
  const hostRoom = () => { const r = rooms[socket.data.hostCode]; return r && r.hostSocket === socket.id ? r : null; };

  // ---------- HOST ----------
  socket.on('host:create', (opts, cb) => {
    if (typeof opts === 'function') cb = opts;
    const prev = opts && opts.code && rooms[opts.code];
    if (prev && opts.hostKey === prev.hostKey) { // host reconnect
      prev.hostSocket = socket.id; socket.data.hostCode = prev.code;
      cb && cb({ code: prev.code, hostKey: prev.hostKey }); return broadcast(prev);
    }
    const code = makeCode();
    const room = rooms[code] = { code, hostKey: Math.random().toString(36).slice(2), hostSocket: socket.id, players: {}, phase: 'lobby',
      round: null, board: null, used: new Set(), dd: null, current: null, final: null, controller: null, hostMode: 'dedicated', teamMode: false, teams: makeTeams(2), ctrlTeam: null, created: Date.now() };
    socket.data.hostCode = code;
    cb && cb({ code, hostKey: room.hostKey }); broadcast(room);
  });
  socket.on('host:selectBoard', ({ boardId }) => {
    const room = hostRoom(); if (!room) return fail('Not hosting a room');
    if (room.phase !== 'lobby') return fail('Game already started');
    const b = BOARDS.find(x => x.id === boardId); if (!b) return fail('Unknown board');
    room.board = b; broadcast(room);
  });
  socket.on('host:mode', ({ mode } = {}) => {
    const room = hostRoom(); if (!room) return fail('Not hosting a room');
    if (room.phase !== 'lobby') return fail('Change host mode before the game starts');
    room.hostMode = mode === 'player' ? 'player' : 'dedicated'; broadcast(room);
  });
  // Teams: host:teams { mode: 'individual'|'teams', count?: 2-4, teams?: [{ name, color }] } — lobby only
  socket.on('host:teams', (opts = {}, cb) => {
    const room = hostRoom(); const done = e => { if (e) fail(e); cb && cb(e ? { error: e } : { ok: true }); };
    if (!room) return done('Not hosting a room');
    if (room.phase !== 'lobby') return done('Set up teams before the game starts');
    if (opts.mode) room.teamMode = opts.mode === 'teams';
    if (opts.count) { const n = Math.min(4, Math.max(2, opts.count | 0)); if (n > room.teams.length) room.teams.push(...makeTeams(n).slice(room.teams.length)); else room.teams = room.teams.slice(0, n); }
    if (Array.isArray(opts.teams)) opts.teams.slice(0, room.teams.length).forEach((t, i) => { if (!t) return;
      const nm = String(t.name || '').trim().slice(0, 20); if (nm) room.teams[i].name = nm;
      if (/^#[0-9a-f]{6}$/i.test(String(t.color || ''))) room.teams[i].color = t.color; });
    const ids = new Set(room.teams.map(t => t.id));
    if (room.teamMode) for (const p of Object.values(room.players)) if (!ids.has(p.team)) p.team = smallestTeam(room).id;
    done(); broadcast(room);
  });
  socket.on('host:assign', ({ pid, team } = {}) => {
    const room = hostRoom(); const p = room && room.players[pid];
    if (!p || room.phase !== 'lobby' || !room.teams.some(t => t.id === team)) return fail('Cannot move that player');
    p.team = team; broadcast(room);
  });
  socket.on('host:start', () => {
    const room = hostRoom(); if (!room) return fail('Not hosting a room');
    if (!room.board) return fail('Pick a board first');
    if (!Object.keys(room.players).length) return fail('Wait for at least one player');
    if (room.teamMode) { for (const p of Object.values(room.players)) if (!room.teams.some(t => t.id === p.team)) p.team = smallestTeam(room).id;
      if (activeTeams(room).length < 2) return fail('Teams mode needs players on at least 2 teams');
      room.teams.forEach(t => { t.score = 0; }); room.ctrlTeam = activeTeams(room)[0].id; room.controller = null; }
    room.round = 0; room.phase = 'board'; room.dd = pickDD(1); room.used = new Set();
    const ct = room.teamMode && room.teams.find(t => t.id === room.ctrlTeam);
    GR.gate(room, `Jeopardy! · ${room.board.name}`, ['Round 1 is about to begin', ct ? `${ct.name} picks first` : room.players[room.controller] ? `${room.players[room.controller].name} picks first` : 'Host picks the first clue']); broadcast(room);
  });
  socket.on('host:reveal', (_, cb) => { // player-host mode: the host (a contestant) sends the answer ONLY to the buzzed player's phone
    const room = hostRoom(); const cur = room && room.current;
    if (!cur || room.hostMode !== 'player' || !cur.buzzed || cur.revealed) return cb && cb({ error: 'Nothing to reveal' });
    cur.peeked = true; cb && cb({ ok: true }); broadcast(room);
  });
  socket.on('player:reveal', (_, cb) => cb && cb({ error: 'Only the host screen can reveal the answer' }));
  socket.on('host:open', ({ c, r }) => {
    const room = hostRoom(); if (!room || room.phase !== 'board') return fail('Cannot open a clue now');
    const e = openClue(room, c, r, null); if (e) fail(e);
  });
  socket.on('host:ddPlayer', ({ pid }) => { // host assigns DD if nobody has control yet
    const room = hostRoom(); const cur = room && room.current;
    if (!cur || !cur.dd || cur.wager !== null || !room.players[pid]) return fail('Cannot assign Daily Double');
    if (room.teamMode && room.ctrlTeam && room.players[pid].team !== room.ctrlTeam) return fail('The Daily Double belongs to the team in control');
    cur.ddPlayer = pid; broadcast(room);
  });
  const ddMax = (room, p) => Math.max(scoreOf(room, p.id), room.round === 0 ? 1000 : 2000); // Teams: the TEAM score sets the limit
  function setWager(room, amount) {
    const cur = room.current, p = room.players[cur.ddPlayer];
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 5 || amount > ddMax(room, p)) return `Wager must be between $5 and $${ddMax(room, p)}`;
    cur.wager = amount; cur.buzzed = cur.ddPlayer; if (room.hostMode === 'player') startReading(room); broadcast(room); return null;
  }
  socket.on('host:ddWager', ({ amount }) => {
    const room = hostRoom(); const cur = room && room.current;
    if (!cur || !cur.dd || !cur.ddPlayer || cur.wager !== null) return fail('No wager pending');
    const e = setWager(room, amount); if (e) fail(e);
  });
  socket.on('host:judge', ({ correct }) => {
    const room = hostRoom(); const cur = room && room.current;
    if (!cur || !cur.buzzed || cur.revealed) return fail('Nobody to judge');
    judge(room, !!correct); broadcast(room);
  });
  socket.on('host:readDone', ({ seq } = {}) => { // host browser finished speaking the clue
    const room = hostRoom(); const cur = room && room.current;
    if (!cur || !cur.reading || (seq && seq !== cur.readSeq)) return;
    finishReading(room);
    broadcast(room);
  });
  socket.on('host:close', () => { // nobody got it / skip. Player mode: first press reveals the answer, second continues
    const room = hostRoom(); if (!room || !room.current) return;
    if (room.hostMode === 'player' && !room.current.revealed) revealAll(room, 'nobody'); else closeClue(room);
    broadcast(room);
  });
  socket.on('host:go', (_, cb) => { const room = hostRoom(); const went = !!(room && GR.go(room)); if (went) broadcast(room); if (typeof cb === 'function') cb(went ? { ok: true } : { error: 'Nothing to start' }); });
  socket.on('host:nextRound', () => {
    const room = hostRoom(); if (!room) return;
    if (room.current) return fail('Close the open clue first');
    if (room.round === 0) { room.round = 1; room.phase = 'board'; room.dd = pickDD(2);
      if (room.teamMode) { const low = [...activeTeams(room)].sort((a, b) => a.score - b.score)[0]; room.ctrlTeam = low ? low.id : null; room.controller = null;
        GR.gate(room, 'Double Jeopardy!', ['Values are doubled', low ? `${low.name} (lowest score) picks first` : '']);
      } else {
      const sorted = Object.values(room.players).sort((a, b) => a.score - b.score); room.controller = sorted[0] ? sorted[0].id : null; // lowest score picks first
      GR.gate(room, 'Double Jeopardy!', ['Values are doubled', sorted[0] ? `${sorted[0].name} (lowest score) picks first` : '']); }
    } else if (room.round === 1) { room.round = 'final'; room.phase = 'final'; room.final = { stage: 'wager', wagers: {}, answers: {}, judged: {}, by: {} }; }
    broadcast(room);
  });
  socket.on('host:finalClue', () => {
    const room = hostRoom(); const f = room && room.final; if (!f || f.stage !== 'wager') return;
    if (room.teamMode) { for (const t of activeTeams(room)) if (f.wagers[t.id] === undefined && t.score <= 0) f.wagers[t.id] = 0; }
    else for (const p of Object.values(room.players)) if (f.wagers[p.id] === undefined && p.score <= 0) f.wagers[p.id] = 0;
    f.stage = 'answer'; broadcast(room);
  });
  socket.on('host:finalLock', () => { const room = hostRoom(); const f = room && room.final; if (!f || f.stage !== 'answer') return; f.stage = 'judge'; broadcast(room); });
  socket.on('host:finalJudge', ({ pid, team, correct }) => {
    const room = hostRoom(); const f = room && room.final;
    if (room && room.teamMode) { const t = room.teams.find(x => x.id === team);
      if (!f || f.stage !== 'judge' || !t || f.judged[t.id] !== undefined) return fail('Cannot judge that');
      const w = f.wagers[t.id] || 0; t.score += correct ? w : -w; f.judged[t.id] = !!correct;
      if (activeTeams(room).every(x => f.judged[x.id] !== undefined)) { f.stage = 'done'; room.phase = 'over'; }
      return broadcast(room); }
    const p = room && room.players[pid];
    if (!f || f.stage !== 'judge' || !p || f.judged[pid] !== undefined) return fail('Cannot judge that');
    const w = f.wagers[pid] || 0; p.score += correct ? w : -w; f.judged[pid] = !!correct;
    if (Object.keys(room.players).every(id => f.judged[id] !== undefined)) { f.stage = 'done'; room.phase = 'over'; }
    broadcast(room);
  });
  socket.on('host:adjust', ({ pid, team, delta }) => {
    const room = hostRoom(); if (room && room.teamMode) { const t = room.teams.find(x => x.id === (team || (room.players[pid] || {}).team)); if (!t) return; t.score += Math.round(Number(delta) || 0); return broadcast(room); }
    const p = room && room.players[pid]; if (!p) return;
    p.score += Math.round(Number(delta) || 0); broadcast(room);
  });
  socket.on('host:kick', ({ pid }) => {
    const room = hostRoom(); const p = room && room.players[pid]; if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('kicked'); delete room.players[pid]; broadcast(room);
  });
  socket.on('host:newGame', () => {
    const room = hostRoom(); if (!room) return;
    if (room.current) clearT(room.current);
    Object.assign(room, { phase: 'lobby', round: null, board: null, used: new Set(), dd: null, current: null, final: null, controller: null, ctrlTeam: null });
    room.teams.forEach(t => { t.score = 0; });
    for (const p of Object.values(room.players)) p.score = 0; broadcast(room);
  });

  // ---------- PLAYER ----------
  socket.on('player:join', ({ code, name, pid }, cb) => {
    code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 16);
    const room = rooms[code]; if (!room) return cb && cb({ error: 'No game with that code' });
    if (!name) return cb && cb({ error: 'Enter a name' });
    pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2);
    let p = room.players[pid];
    if (!p) {
      if (Object.values(room.players).some(x => x.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'That name is taken' });
      if (Object.keys(room.players).length >= 12) return cb && cb({ error: 'Room is full' });
      p = room.players[pid] = { id: pid, name, score: 0, team: null };
      if (room.teamMode) p.team = smallestTeam(room).id; // auto-assigned; the player can switch in the lobby
    }
    p.socketId = socket.id; p.connected = true; socket.data.code = code; socket.data.pid = pid;
    cb && cb({ ok: true, pid, code }); broadcast(room);
  });
  const myRoom = () => { const r = rooms[socket.data.code]; return r && r.players[socket.data.pid] ? r : null; };
  socket.on('player:team', ({ team } = {}, cb) => {
    const room = myRoom(); const p = room && room.players[socket.data.pid];
    if (!p || !room.teamMode || room.phase !== 'lobby' || !room.teams.some(t => t.id === team)) return cb && cb({ error: 'You can only switch teams in the lobby' });
    p.team = team; cb && cb({ ok: true }); broadcast(room);
  });
  socket.on('player:pick', ({ c, r } = {}, cb) => { // Teams mode: any member of the team in control picks the next clue
    const room = myRoom(); const p = room && room.players[socket.data.pid];
    if (!p || !room.teamMode || room.phase !== 'board' || room.current) return cb && cb({ error: 'Cannot pick now' });
    if (!room.ctrlTeam || p.team !== room.ctrlTeam) return cb && cb({ error: "It's not your team's pick" });
    const e = openClue(room, c, r, p.id); cb && cb(e ? { error: e } : { ok: true });
  });
  socket.on('player:buzz', () => {
    const room = myRoom(); const cur = room && room.current; const pid = socket.data.pid;
    if (!cur || !cur.buzzOpen || cur.buzzed || cur.locked.has(pid)) return;
    cur.buzzed = pid; cur.buzzOpen = false; cur.reading = false; clearT(cur); // a mid-read buzz interrupts the reading
    io.to(room.hostSocket).emit('buzz', { pid, name: room.players[pid].name });
    broadcast(room);
  });
  socket.on('player:selfJudge', ({ correct } = {}, cb) => {
    const room = myRoom(); const cur = room && room.current;
    if (!cur || room.hostMode !== 'player' || cur.buzzed !== socket.data.pid || !cur.peeked || cur.revealed) return cb && cb({ error: 'Wait for the host to reveal the answer' });
    judge(room, !!correct); cb && cb({ ok: true }); broadcast(room);
  });
  socket.on('player:ddWager', ({ amount }, cb) => {
    const room = myRoom(); const cur = room && room.current;
    if (!cur || !cur.dd || cur.ddPlayer !== socket.data.pid || cur.wager !== null) return cb && cb({ error: 'No wager pending' });
    const e = setWager(room, amount); cb && cb(e ? { error: e } : { ok: true });
  });
  socket.on('player:finalWager', ({ amount }, cb) => {
    const room = myRoom(); const f = room && room.final; const p = room && room.players[socket.data.pid];
    if (!f || f.stage !== 'wager') return cb && cb({ error: 'Wagers are closed' });
    if (room.teamMode) { const t = teamOf(room, p.id); if (!t.id) return cb && cb({ error: 'You are not on a team' });
      if (f.wagers[t.id] !== undefined) return cb && cb({ error: `${nameOf(room, f.by[t.id + ':w']) || 'Your team'} already locked the team wager` });
      amount = Math.floor(Number(amount)); const tmax = Math.max(0, t.score);
      if (!Number.isFinite(amount) || amount < 0 || amount > tmax) return cb && cb({ error: `Wager between $0 and $${tmax}` });
      f.wagers[t.id] = amount; f.by[t.id + ':w'] = p.id; cb && cb({ ok: true }); return broadcast(room); }
    amount = Math.floor(Number(amount)); const max = Math.max(0, p.score);
    if (!Number.isFinite(amount) || amount < 0 || amount > max) return cb && cb({ error: `Wager between $0 and $${max}` });
    f.wagers[p.id] = amount; cb && cb({ ok: true }); broadcast(room);
  });
  socket.on('player:finalAnswer', ({ answer }, cb) => {
    const room = myRoom(); const f = room && room.final;
    if (!f || f.stage !== 'answer') return cb && cb({ error: 'Answers are closed' });
    if (room.teamMode) { const t = teamOf(room, socket.data.pid); if (!t.id) return cb && cb({ error: 'You are not on a team' });
      if (f.answers[t.id] !== undefined) return cb && cb({ error: `${nameOf(room, f.by[t.id + ':a']) || 'Your team'} already locked the team answer` });
      f.answers[t.id] = String(answer || '').slice(0, 120); f.by[t.id + ':a'] = socket.data.pid; cb && cb({ ok: true }); return broadcast(room); }
    f.answers[socket.data.pid] = String(answer || '').slice(0, 120); cb && cb({ ok: true }); broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.data.code];
    if (room && room.players[socket.data.pid] && room.players[socket.data.pid].socketId === socket.id) {
      room.players[socket.data.pid].connected = false; room.players[socket.data.pid].socketId = null; broadcast(room);
    }
  });
});

// Clean up rooms older than 12 hours
setInterval(() => { for (const c in rooms) if (Date.now() - rooms[c].created > 12 * 3600e3) delete rooms[c]; }, 3600e3).unref();

if (require.main === module) {
  server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    const nets = require('os').networkInterfaces();
    const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    console.log(`\n  Buzzwise is live!\n  Host on this computer:  http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`  Players on same Wi-Fi:  http://${ip}:${PORT}`));
    console.log(`  Friends elsewhere: run  npx --yes cloudflared tunnel --url http://localhost:${PORT}\n`);
  });
}
module.exports = { server, rooms, wof, ff, pir, pw, cae, pri, VERSION };
