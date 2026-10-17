// Buzzwise: Password (namespace /pw). Two-person teams; ONLY the clue-giver's phone ever receives the secret word.
const fs = require('fs'), path = require('path'); const makeParty = require('./lib/party'); const { shuffle } = makeParty;
function loadWords() { const out = { easy: [], medium: [], hard: [] }; let cur = null;
  for (const l of fs.readFileSync(path.join(__dirname, 'data', 'password-words.txt'), 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const m = t.match(/^\[(\w+)\]$/); if (m) { cur = m[1]; continue; } if (cur && out[cur]) out[cur].push(t); } return out; }
const LIGHT_MS = () => +(process.env.PW_LIGHTNING_MS || 60000);
module.exports = function attachPW(io, makeCode) {
  const WORDS = loadWords();
  const draw = room => { const pool = room.difficulty === 'mixed' ? [...WORDS.easy, ...WORDS.medium, ...WORDS.hard] : WORDS[room.difficulty];
    let left = pool.filter(w => !room.used.has(w)); if (!left.length) { room.used.clear(); left = pool; } const w = left[Math.floor(Math.random() * left.length)]; room.used.add(w); return w; };
  const teamOf = (room, pid) => room.teams.findIndex(t => t.members.includes(pid));
  const addTeam = (room, ti, pts) => { room.teams[ti].score += pts; room.teams[ti].members.forEach(id => room.players[id] && (room.players[id].score = room.teams[ti].score)); };
  function startTurn(room) {
    const n = room.teams.length, total = n * room.wordsPerTeam;
    if (room.turnIdx >= total) return startLightning(room);
    const ti = room.turnIdx % n, swap = Math.floor(room.turnIdx / n) % 2, m = room.teams[ti].members;
    room.turn = { team: ti, giver: m[swap], guesser: m[1 - swap], word: draw(room), clue: 1, kind: 'main' };
    room.phase = 'turn'; room.message = `${room.teams[ti].name}: ${room.players[m[swap]].name} gives clues, ${room.players[m[1 - swap]].name} guesses. Worth ${value(room)}!`;
    api.gate(room, `Word ${room.turnIdx + 1} of ${total} · ${room.teams[ti].name}`, [`Clue-giver: ${room.players[m[swap]].name}`, `Guesser: ${room.players[m[1 - swap]].name}`, 'The word appears on the clue-giver\'s phone after Start']);
  }
  const value = room => Math.max(1, 11 - room.turn.clue);
  function finishWord(room, correct) {
    const t = room.turn; if (!t) return { error: 'No word in play' };
    if (t.kind === 'lightning') { if (correct) { t.got++; addTeam(room, t.team, 10); } t.history.push({ word: t.word, correct }); t.word = draw(room); t.clue = 1; room.message = correct ? `Correct! ${t.got} so far.` : 'Pass!'; return { ok: true }; }
    const pts = correct ? value(room) : 0; if (pts) addTeam(room, t.team, pts);
    room.last = { word: t.word, team: t.team, points: pts, correct }; room.turnIdx++; room.message = correct ? `Correct! "${t.word}" for ${pts}.` : `Passed. The word was "${t.word}".`;
    startTurn(room); return { ok: true };
  }
  function startLightning(room) {
    const best = room.teams.reduce((b, t, i) => t.score > room.teams[b].score ? i : b, 0), m = room.teams[best].members;
    room.turn = { team: best, giver: m[0], guesser: m[1], word: draw(room), clue: 1, kind: 'lightning', got: 0, history: [], endsAt: null };
    room.phase = 'lightningReady'; room.message = `Lightning round for ${room.teams[best].name}! ${room.players[m[0]].name} gives clues. +10 per word.`;
  }
  let api;
  const game = {
    title: 'Password', maxPlayers: 16,
    init(room, a) { api = a; Object.assign(room, { teams: [], difficulty: 'easy', wordsPerTeam: 4, used: new Set(), turnIdx: 0, turn: null, last: null }); },
    onLeave(room, pid) { room.teams = room.teams.filter(t => !t.members.includes(pid)); },
    hostView(room) { const t = room.turn;
      return { teams: room.teams, difficulty: room.difficulty, wordsPerTeam: room.wordsPerTeam, last: room.last, counts: { easy: WORDS.easy.length, medium: WORDS.medium.length, hard: WORDS.hard.length },
        turn: t && { team: t.team, giver: t.giver, guesser: t.guesser, clue: t.clue, value: t.kind === 'main' ? value(room) : 10, kind: t.kind, got: t.got, endsAt: t.endsAt,
          history: t.history && (room.phase === 'gameOver' ? t.history : t.history.map(h => ({ correct: h.correct }))) },
        turnNo: room.turnIdx + 1, totalTurns: room.teams.length * room.wordsPerTeam }; },
    playerView(room, pid) { const v = game.hostView(room); const t = room.turn;
      v.myTeam = teamOf(room, pid); v.role = t ? (t.giver === pid ? 'giver' : t.guesser === pid ? 'guesser' : 'watch') : null;
      if (t && t.giver === pid && room.phase !== 'lightningReady') v.word = t.word; // the ONLY place the word is sent
      return v; },
    host: {
      settings(room, { difficulty, wordsPerTeam }) { if (room.phase !== 'lobby') return { error: 'Settings are locked during a game' };
        if (['easy', 'medium', 'hard', 'mixed'].includes(difficulty)) room.difficulty = difficulty; if (wordsPerTeam) room.wordsPerTeam = Math.max(1, Math.min(10, +wordsPerTeam)); },
      makeTeams(room, { shuffle: sh } = {}) { if (room.phase !== 'lobby') return { error: 'Teams are set during a game' };
        let ids = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id); if (sh) ids = shuffle(ids);
        if (ids.length < 2 || ids.length % 2) return { error: 'Password needs an even number of players (2, 4, 6…)' };
        room.teams = []; for (let i = 0; i < ids.length; i += 2) room.teams.push({ name: `Team ${room.players[ids[i]].name} & ${room.players[ids[i + 1]].name}`, members: [ids[i], ids[i + 1]], score: 0 }); },
      start(room) { if (room.phase !== 'lobby' && room.phase !== 'gameOver') return { error: 'Game already running' };
        if (!room.teams.length || room.teams.some(t => t.members.some(id => !room.players[id])) || room.teams.length * 2 !== Object.keys(room.players).length) { const r = game.host.makeTeams(room, {}); if (r && r.error) return r; }
        room.teams.forEach(t => t.score = 0); Object.values(room.players).forEach(p => p.score = 0); room.turnIdx = 0; room.last = null; startTurn(room); },
      lightningGo(room) { const t = room.turn; if (room.phase !== 'lightningReady') return { error: 'Not ready' };
        room.phase = 'lightning'; t.endsAt = Date.now() + LIGHT_MS(); clearTimeout(room.lt);
        room.lt = setTimeout(() => { if (room.turn === t) { room.phase = 'gameOver'; room.message = `Time! ${room.teams[t.team].name} got ${t.got} in the lightning round.`; api.broadcast(room); } }, LIGHT_MS()); },
      // dedicated host can referee from the big screen (it still never sees the word)
      clue(room) { if (room.hostMode !== 'dedicated') return { error: 'Only a dedicated host can judge from this screen' }; return clueStep(room); },
      judge(room, { correct }) { if (room.hostMode !== 'dedicated') return { error: 'Only a dedicated host can judge from this screen' }; return finishWord(room, !!correct); },
      skip(room) { if (!room.turn || room.phase !== 'turn') return { error: 'Nothing to skip' }; return finishWord(room, false); },
      newGame(room) { clearTimeout(room.lt); Object.assign(room, { phase: 'lobby', turn: null, last: null, turnIdx: 0 }); room.teams.forEach(t => t.score = 0); Object.values(room.players).forEach(p => p.score = 0); room.message = 'New game!'; },
    },
    player: {
      clue(room, pid) { if (!room.turn || room.turn.giver !== pid) return { error: 'Only the clue-giver can do that' }; return clueStep(room); },
      judge(room, pid, { correct }) { if (!room.turn || room.turn.giver !== pid || !['turn', 'lightning'].includes(room.phase)) return { error: 'Only the clue-giver can do that' }; return finishWord(room, !!correct); },
    },
  };
  function clueStep(room) { const t = room.turn; if (!t || room.phase !== 'turn') return { error: 'No word in play' };
    if (t.clue >= 10) return finishWord(room, false); t.clue++; room.message = `Clue ${t.clue}: now worth ${value(room)}.`; return { ok: true }; }
  const p = makeParty(io, makeCode, '/pw', game); p.WORDS = WORDS; return p;
};
module.exports.loadWords = loadWords;
