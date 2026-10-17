// Buzzwise: Wheel of Fortune mode (socket.io namespace /wof)
const fs = require('fs'), path = require('path');

const WHEEL = [2500, 600, 700, 600, 650, 500, 700, 'BANKRUPT', 600, 550, 500, 600, 300, 650, 'FREE PLAY', 700, 'LOSE A TURN', 800, 500, 650, 500, 900, 'BANKRUPT', 350];
const VOWELS = 'AEIOU', VOWEL_COST = 250, BONUS_PRIZE = 25000, MIN_WIN = 1000, TOSSUP_PRIZE = 1000;
const ROWS = 4, COLS = 14;
const SPIN_MS = () => +(process.env.WOF_SPIN_MS || 4300);
const REVEAL_MS = () => +(process.env.WOF_REVEAL_MS || 1600);
const BONUS_SECS = () => +(process.env.WOF_BONUS_SECS || 10);

function loadPuzzles() {
  return fs.readFileSync(path.join(__dirname, 'data', 'wof-puzzles.txt'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#')).map(l => { const [c, t] = l.split('|').map(s => s.trim()); return { category: c, text: t.toUpperCase() }; });
}
// Word-wrap into at most 4 rows of 14; returns array of row strings or null
function layout(text) {
  const rows = []; let cur = '';
  for (const w of text.split(' ')) {
    if (w.length > COLS) return null;
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= COLS) cur += ' ' + w; else { rows.push(cur); cur = w; }
  }
  rows.push(cur); return rows.length <= ROWS ? rows : null;
}
const letters = t => t.replace(/[^A-Z]/g, '');
const norm = t => String(t || '').toUpperCase().replace(/[^A-Z]/g, '');
const mask = (text, revealed) => text.replace(/[A-Z]/g, ch => revealed.has(ch) ? ch : '_');

module.exports = function attachWof(io, makeCode) {
  const nsp = io.of('/wof'); const rooms = {}; const PUZZLES = loadPuzzles();
  const code = () => makeCode(c => rooms[c]);

  function pickPuzzle(room) {
    const pool = PUZZLES.map((p, i) => i).filter(i => !room.usedPuzzles.has(i));
    const i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * PUZZLES.length);
    room.usedPuzzles.add(i); return PUZZLES[i];
  }
  const active = room => room.order[room.turn % Math.max(1, room.order.length)];
  const plist = room => room.order.map(id => room.players[id]).filter(Boolean).map(p => ({ id: p.id, name: p.name, bank: p.bank, total: p.total, connected: p.connected }));
  const remainingConsonants = room => [...new Set(letters(room.puzzle.text))].filter(c => !VOWELS.includes(c) && !room.revealed.has(c)).length;
  const remainingVowels = room => [...new Set(letters(room.puzzle.text))].filter(c => VOWELS.includes(c) && !room.revealed.has(c)).length;

  function view(room, forHost) {
    const v = {
      code: room.code, phase: room.phase, roundNum: room.roundNum, players: plist(room), turn: active(room), awaiting: room.awaiting,
      wheel: WHEEL, rotation: room.rotation, spin: room.spin, spinValue: room.spinValue, freePlay: room.freePlay,
      category: room.puzzle && room.puzzle.category, board: room.puzzle && mask(room.puzzle.text, room.revealed),
      used: [...room.used], message: room.message, buzzed: room.buzzed, lockedOut: [...room.lockedOut],
      bonus: room.bonus && { player: room.bonus.player, picks: room.bonus.picks, endsAt: room.bonus.endsAt, result: room.bonus.result },
      lastGuess: room.lastGuess, solved: room.solved, canSpin: room.puzzle ? remainingConsonants(room) > 0 : false,
      vowelsLeft: room.puzzle ? remainingVowels(room) > 0 : false, now: Date.now(),
    };
    v.hostMode = room.hostMode || 'dedicated';
    if ((forHost && room.hostMode !== 'player') || room.solved) v.answer = room.puzzle && room.puzzle.text; // players only get the answer once it's solved/revealed
    return v;
  }
  function broadcast(room) {
    if (room.hostSocket) nsp.to(room.hostSocket).emit('state', view(room, true));
    for (const p of Object.values(room.players)) if (p.socketId) nsp.to(p.socketId).emit('state', view(room, false));
  }
  function nextTurn(room, msg) {
    room.turn = (room.turn + 1) % room.order.length; room.awaiting = 'spin'; room.spinValue = null; room.freePlay = false;
    if (msg) room.message = msg + ` ${room.players[active(room)].name}'s turn.`;
  }
  function clearTimers(room) { clearInterval(room.revealTimer); clearTimeout(room.spinTimer); clearTimeout(room.bonusTimer); room.revealTimer = room.spinTimer = room.bonusTimer = null; }
  function startPuzzle(room, type) {
    clearTimers(room);
    room.puzzle = pickPuzzle(room); room.revealed = new Set(); room.used = new Set(); room.solved = false; room.lastGuess = null;
    room.buzzed = null; room.lockedOut = new Set(); room.spin = null; room.spinValue = null; room.freePlay = false; room.bonus = null;
    for (const p of Object.values(room.players)) p.bank = 0;
    if (type === 'tossup') {
      room.phase = 'tossup'; room.awaiting = 'buzz'; room.message = 'Toss-Up! Buzz in when you know it.'; startReveal(room);
    } else {
      room.phase = 'round'; room.roundNum++; room.awaiting = 'spin';
      if (room.nextStarter && room.order.includes(room.nextStarter)) room.turn = room.order.indexOf(room.nextStarter);
      else room.turn = (room.roundNum - 1) % room.order.length;
      room.nextStarter = null; room.message = `Round ${room.roundNum}: ${room.players[active(room)].name} spins first.`;
    }
  }
  function startReveal(room) {
    clearInterval(room.revealTimer);
    room.revealTimer = setInterval(() => {
      const hidden = [...room.puzzle.text].map((ch, i) => i).filter(i => /[A-Z]/.test(room.puzzle.text[i]) && !room.revealedIdx.has(i));
      if (!hidden.length) { clearInterval(room.revealTimer); room.message = 'Fully revealed. Last chance to buzz!'; return broadcast(room); }
      room.revealedIdx.add(hidden[Math.floor(Math.random() * hidden.length)]);
      // toss-up reveals individual tiles; reflect by revealing a letter only when all its tiles are shown
      broadcast(room);
    }, REVEAL_MS());
  }
  function winRound(room, pid, how) {
    clearTimers(room); const p = room.players[pid];
    room.revealed = new Set(letters(room.puzzle.text)); room.solved = true; room.awaiting = null;
    if (room.phase === 'tossup') { p.total += TOSSUP_PRIZE; room.nextStarter = pid; room.message = `${p.name} solved the Toss-Up! +$${TOSSUP_PRIZE}`; }
    else if (room.phase === 'round') { const won = Math.max(p.bank, MIN_WIN); p.total += won; room.message = `${p.name} solved it${how ? ' ' + how : ''} and banks $${won.toLocaleString()}!`; }
    for (const x of Object.values(room.players)) x.bank = 0;
    room.phase = room.phase === 'tossup' ? 'tossupDone' : 'roundDone';
  }
  function checkSolve(room, pid, guess) {
    const right = norm(guess) === norm(room.puzzle.text);
    room.lastGuess = { pid, guess: String(guess).slice(0, 80), correct: right };
    return right;
  }

  // Patch masking so toss-up shows individual tiles
  const baseView = view;
  view = function (room, forHost) {
    const v = baseView(room, forHost);
    if (room.puzzle && room.phase === 'tossup') v.board = [...room.puzzle.text].map((ch, i) => /[A-Z]/.test(ch) && !room.revealedIdx.has(i) ? '_' : ch).join('');
    return v;
  };

  nsp.on('connection', socket => {
    const fail = m => socket.emit('errorMsg', m);
    const hostRoom = () => { const r = rooms[socket.data.hostCode]; return r && r.hostSocket === socket.id ? r : null; };

    socket.on('host:create', (opts, cb) => {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      const prev = opts && rooms[opts.code];
      if (prev && prev.hostKey === opts.hostKey) { prev.hostSocket = socket.id; socket.data.hostCode = prev.code; cb && cb({ code: prev.code, hostKey: prev.hostKey }); return broadcast(prev); }
      const c = code();
      const room = rooms[c] = { code: c, hostKey: Math.random().toString(36).slice(2), hostSocket: socket.id, players: {}, order: [], turn: 0, phase: 'lobby',
        roundNum: 0, puzzle: null, revealed: new Set(), revealedIdx: new Set(), used: new Set(), usedPuzzles: new Set(), rotation: 0, spin: null,
        awaiting: null, message: 'Waiting for players…', lockedOut: new Set(), created: Date.now() };
      socket.data.hostCode = c; cb && cb({ code: c, hostKey: room.hostKey }); broadcast(room);
    });
    socket.on('host:mode', ({ mode } = {}) => { const room = hostRoom(); if (!room) return fail('Not hosting');
      if (room.puzzle && !room.solved) return fail('Change host mode between puzzles');
      room.hostMode = mode === 'player' ? 'player' : 'dedicated'; broadcast(room); });
    socket.on('host:next', ({ type } = {}) => { // type: 'round' | 'tossup' | 'bonus'
      const room = hostRoom(); if (!room) return fail('Not hosting');
      if (room.order.length < 1) return fail('Need at least one player');
      if (type === 'bonus') {
        clearTimers(room);
        const leader = plist(room).sort((a, b) => b.total - a.total)[0];
        room.puzzle = pickPuzzle(room); room.revealed = new Set('RSTLNE'); room.used = new Set('RSTLNE'); room.solved = false; room.lastGuess = null;
        room.phase = 'bonus'; room.awaiting = 'bonusPicks'; room.bonus = { player: leader.id, picks: null, endsAt: null, result: null };
        room.message = `Bonus Round for ${leader.name}! R S T L N E are free. Pick 3 consonants and 1 vowel.`;
      } else { room.revealedIdx = new Set(); startPuzzle(room, type === 'tossup' ? 'tossup' : 'round'); }
      broadcast(room);
    });
    socket.on('host:bonusPlayer', ({ pid }) => { const room = hostRoom(); if (room && room.bonus && !room.bonus.picks && room.players[pid]) { room.bonus.player = pid; room.message = `Bonus Round for ${room.players[pid].name}! Pick 3 consonants and 1 vowel.`; broadcast(room); } });
    socket.on('host:skip', () => { const room = hostRoom(); if (!room || room.phase !== 'round' || room.solved) return; clearTimeout(room.spinTimer); room.spin = null; nextTurn(room, 'Host skipped the turn.'); broadcast(room); });
    socket.on('host:adjust', ({ pid, field, delta }) => {
      const room = hostRoom(); const p = room && room.players[pid]; if (!p) return;
      const f = field === 'bank' ? 'bank' : 'total'; p[f] += Math.round(+delta || 0); broadcast(room);
    });
    socket.on('host:judge', ({ correct, pid }) => { // override: accept/reject the last guess, or award to pid
      const room = hostRoom(); if (!room || !room.puzzle || room.solved) return fail('Nothing to judge');
      if (room.phase === 'bonus') {
        clearTimeout(room.bonusTimer); const p = room.players[room.bonus.player];
        room.bonus.result = correct ? 'win' : 'lose'; room.solved = true; room.revealed = new Set(letters(room.puzzle.text)); room.awaiting = null;
        if (correct) p.total += BONUS_PRIZE; room.message = correct ? `${p.name} wins the $${BONUS_PRIZE.toLocaleString()} bonus!` : 'So close! The bonus goes unclaimed.';
        room.phase = 'over'; return broadcast(room);
      }
      const who = pid || (room.lastGuess && room.lastGuess.pid) || room.buzzed;
      if (correct && who && room.players[who]) winRound(room, who, '(host ruling)');
      else if (!correct && room.phase === 'round' && room.lastGuess && room.lastGuess.correct === false) room.message = 'Host confirms: incorrect.';
      broadcast(room);
    });
    socket.on('host:kick', ({ pid }) => { const room = hostRoom(); if (!room || !room.players[pid]) return; const wasActive = active(room) === pid;
      room.order = room.order.filter(x => x !== pid); delete room.players[pid]; if (room.order.length) { room.turn %= room.order.length; if (wasActive && room.phase === 'round') room.awaiting = 'spin'; } broadcast(room); });

    socket.on('player:join', ({ code: c, name, pid }, cb) => {
      c = String(c || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 14);
      const room = rooms[c]; if (!room) return cb && cb({ error: 'No Wheel game with that code' });
      if (!name) return cb && cb({ error: 'Enter a name' });
      pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2);
      let p = room.players[pid];
      if (!p) {
        if (room.order.length >= 4) return cb && cb({ error: 'Game is full (4 players max)' });
        if (Object.values(room.players).some(x => x.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'That name is taken' });
        p = room.players[pid] = { id: pid, name, bank: 0, total: 0 }; room.order.push(pid);
      }
      p.socketId = socket.id; p.connected = true; socket.data.code = c; socket.data.pid = pid;
      if (room.phase === 'lobby') room.message = `${room.order.length} player${room.order.length > 1 ? 's' : ''} ready.`;
      cb && cb({ ok: true, pid, code: c }); broadcast(room);
    });
    const me = () => { const r = rooms[socket.data.code]; return r && r.players[socket.data.pid] ? r : null; };
    const myTurn = room => room.phase === 'round' && !room.solved && active(room) === socket.data.pid;

    socket.on('player:spin', () => {
      const room = me(); if (!room || !myTurn(room) || room.awaiting !== 'spin' && room.awaiting !== 'action') return;
      if (remainingConsonants(room) === 0) return socket.emit('errorMsg', 'No consonants left. Buy a vowel or solve!');
      const idx = Math.floor(Math.random() * WHEEL.length), seg = 360 / WHEEL.length;
      const jitter = (Math.random() - 0.5) * seg * 0.7;
      const target = ((-(idx * seg) + jitter) % 360 + 360) % 360, cur = ((room.rotation % 360) + 360) % 360;
      room.rotation += 360 * 5 + ((target - cur + 360) % 360);
      room.spin = { idx, value: WHEEL[idx], rotation: room.rotation, ms: SPIN_MS(), at: Date.now() }; room.awaiting = 'spinning';
      room.message = `${room.players[socket.data.pid].name} is spinning…`; broadcast(room);
      room.spinTimer = setTimeout(() => {
        const p = room.players[active(room)]; const v = WHEEL[idx];
        if (v === 'BANKRUPT') { p.bank = 0; nextTurn(room, `BANKRUPT! ${p.name} loses the round bank.`); }
        else if (v === 'LOSE A TURN') nextTurn(room, `${p.name} loses a turn.`);
        else if (v === 'FREE PLAY') { room.freePlay = true; room.spinValue = 500; room.awaiting = 'consonant'; room.message = `FREE PLAY! ${p.name} may call any letter ($500 per consonant, free vowel, no penalty).`; }
        else { room.spinValue = v; room.awaiting = 'consonant'; room.message = `$${v} — ${p.name}, call a consonant.`; }
        broadcast(room);
      }, SPIN_MS());
    });
    socket.on('player:letter', ({ letter }) => {
      const room = me(); if (!room || !myTurn(room)) return;
      const L = String(letter || '').toUpperCase().slice(0, 1); const p = room.players[socket.data.pid];
      if (!/[A-Z]/.test(L)) return; if (room.used.has(L)) return socket.emit('errorMsg', `${L} was already called`);
      const isV = VOWELS.includes(L);
      if (room.awaiting === 'consonant' && isV && !room.freePlay) return socket.emit('errorMsg', 'Pick a consonant (or buy a vowel)');
      if (room.awaiting === 'vowel' && !isV) return socket.emit('errorMsg', 'Pick a vowel');
      if (room.awaiting !== 'consonant' && room.awaiting !== 'vowel') return;
      room.used.add(L); const count = [...room.puzzle.text].filter(c => c === L).length;
      if (count) {
        room.revealed.add(L);
        if (!isV) p.bank += count * room.spinValue;
        room.message = `There ${count === 1 ? 'is 1' : 'are ' + count} ${L}${count > 1 ? "'s" : ''}!${!isV ? ` +$${(count * room.spinValue).toLocaleString()}` : ''}`;
        room.awaiting = 'action'; room.freePlay = false;
      } else if (room.freePlay) { room.message = `No ${L} — but it was a Free Play, so ${p.name} keeps going.`; room.awaiting = 'action'; room.freePlay = false; }
      else nextTurn(room, `Sorry, no ${L}.`);
      broadcast(room);
    });
    socket.on('player:buyVowel', () => {
      const room = me(); if (!room || !myTurn(room) || room.awaiting !== 'action' && room.awaiting !== 'spin') return;
      const p = room.players[socket.data.pid];
      if (p.bank < VOWEL_COST) return socket.emit('errorMsg', `You need $${VOWEL_COST} in your round bank`);
      if (!remainingVowels(room) && ![...VOWELS].some(v => !room.used.has(v))) return socket.emit('errorMsg', 'No vowels left');
      p.bank -= VOWEL_COST; room.awaiting = 'vowel'; room.message = `${p.name} buys a vowel.`; broadcast(room);
    });
    socket.on('player:solve', ({ guess }) => {
      const room = me(); if (!room || !room.puzzle || room.solved) return; const pid = socket.data.pid, p = room.players[pid];
      if (room.phase === 'round') {
        if (!myTurn(room) || !['spin', 'action', 'solving'].includes(room.awaiting)) return;
        if (checkSolve(room, pid, guess)) winRound(room, pid); else nextTurn(room, `"${String(guess).slice(0, 40)}" is not it.`);
      } else if (room.phase === 'tossup') {
        if (room.buzzed !== pid) return;
        if (checkSolve(room, pid, guess)) winRound(room, pid);
        else { room.lockedOut.add(pid); room.buzzed = null; room.awaiting = 'buzz'; room.message = `${p.name} missed. Keep buzzing!`; startReveal(room); }
      } else if (room.phase === 'bonus') {
        if (room.bonus.player !== pid || room.awaiting !== 'bonusSolve') return;
        if (checkSolve(room, pid, guess)) { clearTimeout(room.bonusTimer); room.bonus.result = 'win'; p.total += BONUS_PRIZE; room.solved = true; room.revealed = new Set(letters(room.puzzle.text));
          room.awaiting = null; room.phase = 'over'; room.message = `${p.name} solved the Bonus Round and wins $${BONUS_PRIZE.toLocaleString()}!`; }
        else room.message = `${p.name} guessed "${String(guess).slice(0, 40)}"… keep trying!`;
      }
      broadcast(room);
    });
    socket.on('player:buzz', () => {
      const room = me(); if (!room || room.phase !== 'tossup' || room.buzzed || room.solved || room.lockedOut.has(socket.data.pid)) return;
      clearInterval(room.revealTimer); room.buzzed = socket.data.pid; room.awaiting = 'tossupSolve';
      room.message = `${room.players[socket.data.pid].name} buzzed in!`; broadcast(room);
    });
    socket.on('player:bonusPicks', ({ consonants, vowel }, cb) => {
      const room = me(); if (!room || room.phase !== 'bonus' || room.bonus.player !== socket.data.pid || room.awaiting !== 'bonusPicks') return cb && cb({ error: 'Not your bonus' });
      const cs = [...new Set((consonants || []).map(c => String(c).toUpperCase()))].filter(c => /^[A-Z]$/.test(c) && !VOWELS.includes(c) && !'RSTLN'.includes(c));
      const v = String(vowel || '').toUpperCase();
      if (cs.length !== 3 || !'AIOU'.includes(v) || !v) return cb && cb({ error: 'Pick 3 new consonants and 1 vowel (not E)' });
      room.bonus.picks = [...cs, v]; [...cs, v].forEach(c => { room.used.add(c); room.revealed.add(c); });
      room.awaiting = 'bonusSolve'; room.bonus.endsAt = Date.now() + BONUS_SECS() * 1000;
      room.message = `${BONUS_SECS()} seconds on the clock… solve it!`;
      room.bonusTimer = setTimeout(() => { if (room.phase === 'bonus' && !room.solved) { room.awaiting = 'bonusJudge'; room.message = "Time's up! Host, make the call."; broadcast(room); } }, BONUS_SECS() * 1000);
      cb && cb({ ok: true }); broadcast(room);
    });
    socket.on('disconnect', () => {
      const room = rooms[socket.data.code]; const p = room && room.players[socket.data.pid];
      if (p && p.socketId === socket.id) { p.connected = false; p.socketId = null; broadcast(room); }
    });
  });
  setInterval(() => { for (const c in rooms) if (Date.now() - rooms[c].created > 12 * 3600e3) { clearTimers(rooms[c]); delete rooms[c]; } }, 3600e3).unref();
  return { rooms, WHEEL };
};
module.exports.loadPuzzles = loadPuzzles; module.exports.layout = layout;
