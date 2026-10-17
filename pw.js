// Buzzwise: Password (namespace /pw). Classic head-to-head: every team's clue-giver gets the same secret word; teams alternate one clue at a time.
// The word never reaches the shared screen or any guesser until the word is solved (or runs out of clues).
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
  // ---- classic head-to-head: every team's clue-giver sees the SAME word; teams alternate one clue at a time ----
  const totalWords = room => room.teams.length * room.wordsPerTeam;
  const value = room => { const t = room.turn; return t.kind !== 'main' ? 10 : Math.max(0, (t.given ? 11 : 10) - t.clues); };
  const syncActive = room => { const t = room.turn; t.giver = t.givers[t.team]; t.guesser = t.guessers[t.team]; };
  function startTurn(room) {
    if (room.turnIdx >= totalWords(room)) return startLightning(room);
    const n = room.teams.length, w = room.turnIdx, starter = w % n;
    const givers = room.teams.map(tm => tm.members[w % tm.members.length]);
    const guessers = room.teams.map((tm, i) => tm.members.find(id => id !== givers[i]));
    room.turn = { kind: 'main', word: draw(room), starter, team: starter, clues: 0, given: false, givers, guessers, log: [] }; syncActive(room);
    room.phase = 'turn'; room.message = `${room.teams[starter].name} starts. ${room.players[givers[starter]].name}, give one clue!`;
    api.gate(room, `Word ${w + 1} of ${totalWords(room)}`, [`${room.teams[starter].name} goes first`, ...room.teams.map((tm, i) => `${tm.name}: ${room.players[givers[i]].name} gives, ${room.players[guessers[i]].name} guesses`), 'Every clue-giver gets the same word after Start']);
  }
  function reveal(room, winner) {
    const t = room.turn, pts = winner === null ? 0 : value(room); if (pts) addTeam(room, winner, pts);
    room.last = { word: t.word, team: winner, points: pts, correct: winner !== null, clues: t.clues };
    room.phase = 'reveal'; room.message = winner === null ? `Out of clues! Nobody scores. The word was "${t.word}".` : `${room.teams[winner].name} got it for ${pts}! The word was "${t.word}".`;
    return { ok: true };
  }
  function giveClue(room) { const t = room.turn; if (!t || room.phase !== 'turn' || t.kind !== 'main') return { error: 'No word in play' };
    if (t.given) return { error: 'One clue per turn, then Correct or Wrong' };
    t.clues++; t.given = true; t.log.push({ team: t.team, clue: t.clues });
    room.message = `Clue ${t.clues} from ${room.players[t.giver].name}: ${room.teams[t.team].name}, guess for ${value(room)}!`; return { ok: true }; }
  function finishWord(room, correct) {
    const t = room.turn; if (!t) return { error: 'No word in play' };
    if (t.kind === 'lightning') { if (correct) { t.got++; addTeam(room, t.team, 10); } t.history.push({ word: t.word, correct }); t.word = draw(room); t.clue = 1; room.message = correct ? `Correct! ${t.got} so far.` : 'Pass!'; return { ok: true }; }
    if (room.phase !== 'turn') return { error: 'No word in play' };
    if (!t.given) { t.clues++; t.given = true; } // tapping Correct / Wrong counts the clue that was just given
    if (correct) return reveal(room, t.team);
    if (t.clues >= 10) return reveal(room, null);
    t.team = (t.team + 1) % room.teams.length; t.given = false; syncActive(room);
    room.message = `Wrong! Over to ${room.teams[t.team].name}: ${room.players[t.giver].name}, one clue for ${value(room)}.`; return { ok: true };
  }
  function nextWord(room) { if (room.phase !== 'reveal') return { error: 'Finish this word first' }; room.turnIdx++; startTurn(room); return { ok: true }; }
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
      return { main: t && t.kind === 'main' ? { starter: t.starter, clues: t.clues, given: t.given, givers: t.givers, guessers: t.guessers, word: room.phase === 'reveal' ? t.word : undefined } : null, teams: room.teams, difficulty: room.difficulty, wordsPerTeam: room.wordsPerTeam, last: room.last, counts: { easy: WORDS.easy.length, medium: WORDS.medium.length, hard: WORDS.hard.length },
        turn: t && { team: t.team, giver: t.giver, guesser: t.guesser, clue: t.kind === 'main' ? t.clues : t.clue, value: t.kind === 'main' ? value(room) : 10, kind: t.kind, got: t.got, endsAt: t.endsAt,
          history: t.history && (room.phase === 'gameOver' ? t.history : t.history.map(h => ({ correct: h.correct }))) },
        turnNo: room.turnIdx + 1, totalTurns: totalWords(room) }; },
    playerView(room, pid) { const v = game.hostView(room); const t = room.turn;
      v.myTeam = teamOf(room, pid);
      if (t && t.kind === 'main') { v.role = t.givers.includes(pid) ? 'giver' : t.guessers.includes(pid) ? 'guesser' : 'watch'; v.myTurn = v.myTeam === t.team;
        if (v.role === 'giver' && ['turn', 'reveal'].includes(room.phase)) v.word = t.word; // every team's clue-giver, and nobody else
        if (room.phase === 'reveal') v.word = t.word; }
      else { v.role = t ? (t.giver === pid ? 'giver' : t.guesser === pid ? 'guesser' : 'watch') : null;
        if (t && t.giver === pid && room.phase !== 'lightningReady') v.word = t.word; } // lightning: giver only
      return v; },
    host: {
      settings(room, { difficulty, wordsPerTeam }) { if (room.phase !== 'lobby') return { error: 'Settings are locked during a game' };
        if (['easy', 'medium', 'hard', 'mixed'].includes(difficulty)) room.difficulty = difficulty; if (wordsPerTeam) room.wordsPerTeam = Math.max(1, Math.min(10, +wordsPerTeam)); },
      makeTeams(room, { shuffle: sh } = {}) { if (room.phase !== 'lobby') return { error: 'Teams are set during a game' };
        let ids = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id); if (sh) ids = shuffle(ids);
        if (ids.length < 4 || ids.length % 2) return { error: 'Password needs an even number of players, at least 4 (two teams of two)' };
        room.teams = []; for (let i = 0; i < ids.length; i += 2) room.teams.push({ name: `Team ${room.players[ids[i]].name} & ${room.players[ids[i + 1]].name}`, members: [ids[i], ids[i + 1]], score: 0 }); },
      start(room) { if (room.phase !== 'lobby' && room.phase !== 'gameOver') return { error: 'Game already running' };
        if (!room.teams.length || room.teams.some(t => t.members.some(id => !room.players[id])) || room.teams.length * 2 !== Object.keys(room.players).length) { const r = game.host.makeTeams(room, {}); if (r && r.error) return r; }
        room.teams.forEach(t => t.score = 0); Object.values(room.players).forEach(p => p.score = 0); room.turnIdx = 0; room.last = null; startTurn(room); },
      lightningGo(room) { const t = room.turn; if (room.phase !== 'lightningReady') return { error: 'Not ready' };
        room.phase = 'lightning'; t.endsAt = Date.now() + LIGHT_MS(); clearTimeout(room.lt);
        room.lt = setTimeout(() => { if (room.turn === t) { room.phase = 'gameOver'; room.message = `Time! ${room.teams[t.team].name} got ${t.got} in the lightning round.`; api.broadcast(room); } }, LIGHT_MS()); },
      // dedicated host can referee from the big screen (it still never sees the word)
      clue(room) { if (room.hostMode !== 'dedicated') return { error: 'Only a dedicated host can judge from this screen' }; return giveClue(room); },
      next(room) { return nextWord(room); },
      judge(room, { correct }) { if (room.hostMode !== 'dedicated') return { error: 'Only a dedicated host can judge from this screen' }; return finishWord(room, !!correct); },
      skip(room) { if (!room.turn || room.phase !== 'turn') return { error: 'Nothing to skip' }; return reveal(room, null); },
      newGame(room) { clearTimeout(room.lt); Object.assign(room, { phase: 'lobby', turn: null, last: null, turnIdx: 0 }); room.teams.forEach(t => t.score = 0); Object.values(room.players).forEach(p => p.score = 0); room.message = 'New game!'; },
    },
    player: {
      clue(room, pid) { if (!room.turn || room.turn.giver !== pid) return { error: "Only the active team's clue-giver can do that" }; return giveClue(room); },
      judge(room, pid, { correct }) { if (!room.turn || room.turn.giver !== pid || !['turn', 'lightning'].includes(room.phase)) return { error: "Only the active team's clue-giver can do that" }; return finishWord(room, !!correct); },
    },
  };
  const p = makeParty(io, makeCode, '/pw', game); p.WORDS = WORDS; return p;
};
module.exports.loadWords = loadWords;
