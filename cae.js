// Buzzwise: Cards Against Everyone (namespace /cae). Original party card game.
// Hands are sent ONLY to their owner; who played which card stays hidden until the judge picks.
const fs = require('fs'), path = require('path'); const makeParty = require('./lib/party'); const { shuffle } = makeParty;
const DECKS = { family: { name: 'Family', rating: 'Kid-safe', main: true }, fun: { name: 'Fun', rating: 'PG-13', main: true }, afterdark: { name: 'After Dark', rating: '18+', main: true, adult: true },
  popculture: { name: 'Pop Culture', rating: 'PG-13', main: false }, office: { name: 'Work & Office', rating: 'PG-13', main: false } };
function loadDeck(id) { const out = { prompts: [], answers: [] }; let cur = null;
  for (const l of fs.readFileSync(path.join(__dirname, 'data', 'cae', id + '.txt'), 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue;
    if (t === '[prompts]' || t === '[answers]') { cur = t.slice(1, -1); continue; } if (cur) out[cur].push(t); }
  out.prompts = out.prompts.map(text => ({ text, pick: Math.max(1, (text.match(/____/g) || []).length) })); return out; }
const HAND = 7, BLANK_EVERY = 25;
module.exports = function attachCAE(io, makeCode) {
  const DATA = Object.fromEntries(Object.keys(DECKS).map(id => [id, loadDeck(id)]));
  let api, cid = 0;
  const order = room => Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id);
  const judgeOf = room => room.hostMode === 'dedicated' ? null : room.round && room.round.czar;
  function build(room) {
    const ans = [], pr = []; for (const d of room.decks) { ans.push(...DATA[d].answers); pr.push(...DATA[d].prompts); }
    room.answerPile = shuffle([...new Set(ans)]).map(text => ({ id: ++cid, text }));
    if (room.writeIns) for (let i = BLANK_EVERY; i < room.answerPile.length; i += BLANK_EVERY + 1) room.answerPile.splice(i, 0, { id: ++cid, blank: true, text: '✏️ Blank card' });
    room.promptPile = shuffle(pr); room.hands = {};
  }
  const drawA = room => { if (!room.answerPile.length) build2(room); return room.answerPile.pop(); };
  function build2(room) { const inHands = new Set(Object.values(room.hands).flat().map(c => c.text)); const ans = []; for (const d of room.decks) ans.push(...DATA[d].answers);
    room.answerPile = shuffle(ans.filter(t => !inHands.has(t))).map(text => ({ id: ++cid, text })); }
  const refill = room => { for (const id of order(room)) { const h = room.hands[id] = room.hands[id] || []; while (h.length < HAND) h.push(drawA(room)); } };
  function startRound(room) {
    refill(room); if (!room.promptPile.length) { const pr = []; for (const d of room.decks) pr.push(...DATA[d].prompts); room.promptPile = shuffle(pr); }
    const ids = order(room), czar = room.hostMode === 'dedicated' ? null : ids[room.roundIdx % ids.length];
    room.round = { prompt: room.promptPile.pop(), czar, subs: {}, shown: null, winner: null };
    room.phase = 'submit'; room.message = czar ? `${room.players[czar].name} is the Card Czar.` : 'The host judges this round.';
    api.gate(room, `Round ${room.roundIdx + 1}`, [czar ? `Card Czar: ${room.players[czar].name}` : 'The host is the judge', `First to ${room.target} points wins`]);
  }
  const players = room => order(room).filter(id => id !== judgeOf(room) && room.players[id].connected !== false);
  function maybeJudge(room) { const r = room.round; if (players(room).every(id => r.subs[id])) {
    r.shown = shuffle(Object.entries(r.subs).map(([pid, s]) => ({ sid: Math.random().toString(36).slice(2, 8), pid, cards: s.cards })));
    room.phase = 'judge'; room.message = judgeOf(room) ? `${room.players[judgeOf(room)].name}, pick your favourite!` : 'Host: pick the winner!'; } }
  function pick(room, sid) { const r = room.round; if (room.phase !== 'judge') return { error: 'Not judging yet' };
    const s = r.shown.find(x => x.sid === sid); if (!s) return { error: 'Pick a submission' };
    r.winner = s.pid; const p = room.players[s.pid]; if (p) p.score++;
    room.phase = p && p.score >= room.target ? 'gameOver' : 'result'; room.message = `${p ? p.name : '?'} wins the round!${room.phase === 'gameOver' ? ` First to ${room.target} — ${p.name} wins the game!` : ''}`; return { ok: true }; }
  const pub = (room, pid) => { const r = room.round; if (!r) return null;
    const reveal = room.phase === 'result' || room.phase === 'gameOver';
    return { prompt: r.prompt, czar: r.czar, submitted: Object.keys(r.subs).length, needed: players(room).length, iSubmitted: !!(pid && r.subs[pid]),
      submittedIds: Object.keys(r.subs), // who has played (not WHAT) so the screen can show progress
      shown: r.shown && r.shown.map(s => ({ sid: s.sid, cards: s.cards, ...(reveal ? { pid: s.pid } : {}) })), winner: reveal ? r.winner : null }; };
  const game = {
    title: 'Cards Against Everyone',
    init(room, a) { api = a; Object.assign(room, { decks: ['family'], adultOk: false, target: 7, writeIns: false, roundIdx: 0, round: null, hands: {} }); },
    onLeave(room, pid) { delete room.hands[pid]; },
    hostView(room) { return { decks: room.decks, deckInfo: Object.fromEntries(Object.entries(DECKS).map(([k, d]) => [k, { ...d, prompts: DATA[k].prompts.length, answers: DATA[k].answers.length }])),
      adultOk: room.adultOk, target: room.target, writeIns: room.writeIns, round: pub(room, null), roundNo: room.roundIdx + 1 }; },
    playerView(room, pid) { return { ...game.hostView(room), round: pub(room, pid), hand: room.hands[pid] || [] }; },
    host: {
      settings(room, { decks, adultConfirmed, target, writeIns }) { if (room.phase !== 'lobby' && room.phase !== 'gameOver') return { error: 'Settings are locked during a game' };
        if (Array.isArray(decks)) { const d = decks.filter(x => DECKS[x]); if (!d.length) return { error: 'Pick at least one deck' };
          if (d.includes('afterdark') && !(adultConfirmed || room.adultOk)) return { error: 'After Dark is 18+. Confirm everyone playing is an adult.' };
          if (d.includes('afterdark')) room.adultOk = true; room.decks = d; }
        if (target) room.target = Math.max(1, Math.min(20, +target)); if (writeIns !== undefined) room.writeIns = !!writeIns; },
      start(room) { if (Object.keys(room.players).length < 3) return { error: 'Need at least 3 players' };
        if (room.decks.includes('afterdark') && !room.adultOk) return { error: 'Confirm 18+ for After Dark' };
        Object.values(room.players).forEach(p => p.score = 0); room.roundIdx = 0; build(room); startRound(room); },
      pick(room, { sid }) { if (room.hostMode !== 'dedicated') return { error: 'The Card Czar picks on their phone' }; return pick(room, sid); },
      next(room) { if (room.phase !== 'result') return { error: 'Pick a winner first' }; room.roundIdx++; startRound(room); },
      forceJudge(room) { const r = room.round; if (!r || room.phase !== 'submit' || !Object.keys(r.subs).length) return { error: 'No submissions yet' };
        r.shown = shuffle(Object.entries(r.subs).map(([pid, s]) => ({ sid: Math.random().toString(36).slice(2, 8), pid, cards: s.cards }))); room.phase = 'judge'; room.message = 'Judging time!'; },
      newGame(room) { Object.assign(room, { phase: 'lobby', round: null, roundIdx: 0, message: 'New game!' }); Object.values(room.players).forEach(p => p.score = 0); },
    },
    player: {
      submit(room, pid, { ids, texts }) { const r = room.round; if (!r || room.phase !== 'submit') return { error: 'Not accepting cards right now' };
        if (pid === judgeOf(room)) return { error: "You're the Card Czar this round" }; if (r.subs[pid]) return { error: 'Already submitted' };
        const h = room.hands[pid] || []; if (!Array.isArray(ids) || ids.length !== r.prompt.pick || new Set(ids).size !== ids.length) return { error: `Pick ${r.prompt.pick} card${r.prompt.pick > 1 ? 's' : ''}` };
        const cards = []; for (let i = 0; i < ids.length; i++) { const c = h.find(x => x.id === ids[i]); if (!c) return { error: 'That card is not in your hand' };
          if (c.blank) { const t = String((texts || [])[i] || '').trim().slice(0, 80); if (!t) return { error: 'Write something on your blank card' }; cards.push(t); } else cards.push(c.text); }
        room.hands[pid] = h.filter(c => !ids.includes(c.id)); r.subs[pid] = { cards }; maybeJudge(room); return { ok: true }; },
      pick(room, pid, { sid }) { if (judgeOf(room) !== pid) return { error: 'Only the Card Czar picks' }; return pick(room, sid); },
    },
  };
  const p = makeParty(io, makeCode, '/cae', game); p.DATA = DATA; p.DECKS = DECKS; return p;
};
module.exports.loadDeck = loadDeck; module.exports.DECKS = DECKS;
