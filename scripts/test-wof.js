// Wheel of Fortune flow test (in-process server, forced spin results)
require('./autogo');
process.env.WOF_SPIN_MS = '30'; process.env.WOF_REVEAL_MS = '40'; process.env.WOF_BONUS_SECS = '1';
const { server, wof } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
const W = wof.WHEEL, rnd = Math.random;
async function spinTo(sock, value) { const idx = W.indexOf(value); Math.random = () => (idx + 0.5) / W.length; sock.emit('player:spin'); await wait(20); Math.random = rnd; await wait(80); }

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/wof`;
  const mk = () => { const s = io(url, { transports: ['websocket'], forceNew: true }); s.all = []; s.errors = []; s.on('state', x => { s.state = x; s.all.push(JSON.stringify(x)); }); s.on('errorMsg', e => s.errors.push(e)); return s; };
  try {
    const host = mk(), a = mk(), b = mk();
    const { code } = await call(host, 'host:create', {}); ok(/^[A-Z]{5}$/.test(code), 'WoF room created ' + code);
    await call(a, 'player:join', { code, name: 'Ann', pid: 'A' }); await call(b, 'player:join', { code, name: 'Ben', pid: 'B' });
    const extra = [mk(), mk(), mk()]; for (let i = 0; i < 3; i++) await call(extra[i], 'player:join', { code, name: 'X' + i, pid: 'X' + i }).then(r => i === 2 && ok(r.error, '5th player rejected (max 4)'));
    for (let i = 0; i < 2; i++) host.emit('host:kick', { pid: 'X' + i }); await wait(80);
    const room = wof.rooms[code];
    host.emit('host:next', { type: 'round' }); await wait(80);
    ok(host.state.phase === 'round' && host.state.answer && !a.state.answer, 'round started; host sees answer, players do not');
    ok(/^[_ A-Z\-'&!?.,]+$/.test(a.state.board) && !/[A-Z]/.test(a.state.board.replace(/[^A-Z_]/g, '').replace(/_/g, '')), 'player board fully masked');
    const P = () => room.puzzle.text, cons = l => [...P()].filter(c => c === l).length;
    const present = [...new Set(P().replace(/[^A-Z]/g, ''))].filter(c => !'AEIOU'.includes(c));
    const absent = 'BCDFGHJKLMNPQRSTVWXYZ'.split('').filter(c => !P().includes(c));
    ok(host.state.turn === 'A', 'Ann starts');
    b.emit('player:spin'); await wait(60); ok(host.state.awaiting === 'spin', "out-of-turn spin ignored");
    // cash spin + correct consonant
    await spinTo(a, 600); ok(host.state.spin.value === 600 && host.state.awaiting === 'consonant', 'spin lands on $600 (server-decided)');
    ok(((host.state.spin.rotation % 360) + 360) % 360 < 360 && Math.abs(((-(W.indexOf(600) * 15) - host.state.spin.rotation) % 360 + 540) % 360 - 180) < 8, 'animation rotation matches landed wedge');
    a.emit('player:letter', { letter: 'A' }); await wait(50); ok(a.errors.some(e => /consonant/.test(e)), 'vowel rejected when consonant required');
    const L = present[0]; a.emit('player:letter', { letter: L }); await wait(60);
    ok(host.state.players[0].bank === 600 * cons(L) && host.state.board.includes(L) && host.state.awaiting === 'action', `consonant ${L} x${cons(L)} adds $${600 * cons(L)}, revealed, keeps turn`);
    // used letter disabled
    await spinTo(a, 500); a.emit('player:letter', { letter: L }); await wait(50); ok(a.errors.some(e => /already/.test(e)), 'used letter rejected');
    // wrong consonant -> turn passes
    a.emit('player:letter', { letter: absent[0] }); await wait(60); ok(host.state.turn === 'B' && host.state.used.includes(absent[0]), 'wrong consonant passes turn to Ben');
    // lose a turn
    await spinTo(b, 'LOSE A TURN'); ok(host.state.turn === 'A', 'Lose a Turn passes back to Ann');
    // buy vowel
    const bankBefore = room.players.A.bank; a.emit('player:buyVowel'); await wait(50);
    ok(room.players.A.bank === bankBefore - 250 && host.state.awaiting === 'vowel', 'buy a vowel costs $250');
    const vow = [...'AEIOU'].find(v => P().includes(v)); if (vow) { a.emit('player:letter', { letter: vow }); await wait(60); ok(host.state.board.includes(vow) && host.state.turn === 'A', `vowel ${vow} revealed, turn kept`); }
    // bankrupt
    await spinTo(a, 'BANKRUPT'); ok(room.players.A.bank === 0 && host.state.turn === 'B', 'Bankrupt zeroes round bank and passes turn');
    // free play: wrong letter keeps turn
    await spinTo(b, 'FREE PLAY'); b.emit('player:letter', { letter: absent[1] }); await wait(60); ok(host.state.turn === 'B' && host.state.awaiting === 'action', 'Free Play miss keeps turn');
    // earn and wrong solve then right solve
    await spinTo(b, 900); const L2 = present.find(c => !room.used.has(c)); if (L2) { b.emit('player:letter', { letter: L2 }); await wait(60); }
    const benBank = room.players.B.bank; ok(benBank === 900 * (L2 ? cons(L2) : 0), 'Ben banks consonant money');
    b.emit('player:solve', { guess: 'definitely wrong' }); await wait(60); ok(host.state.turn === 'A' && host.state.lastGuess.correct === false, 'wrong solve passes turn');
    a.emit('player:solve', { guess: P().toLowerCase().replace(/[^a-z ]/g, '') }); await wait(60);
    ok(host.state.solved && room.players.A.total === 1000 && a.state.answer === P(), 'Ann solves: wins house minimum $1,000 into total; answer revealed to players');
    ok(room.players.B.total === 0 && room.players.B.bank === 0, 'non-winner bank discarded');
    // round 2 + host override + skip
    host.emit('host:next', { type: 'round' }); await wait(80); ok(host.state.roundNum === 2 && room.players.A.bank === 0, 'round change: round 2, banks reset');
    const r2 = host.state.turn; host.emit('host:skip'); await wait(50); ok(host.state.turn !== r2, 'host skip turn');
    host.emit('host:adjust', { pid: 'B', field: 'total', delta: 300 }); await wait(50); ok(room.players.B.total === 300, 'host fixes score');
    room.players.B.bank = 2000; host.emit('host:judge', { correct: true, pid: 'B' }); await wait(60); ok(room.players.B.total === 2300, 'host override awards puzzle (bank 2000 -> total)');
    // toss-up
    host.emit('host:next', { type: 'tossup' }); await wait(200);
    ok(host.state.phase === 'tossup' && /[A-Z]/.test(a.state.board.replace(/[^A-Z]/g, '')), 'toss-up reveals letters over time');
    a.emit('player:buzz'); b.emit('player:buzz'); await wait(50); ok(host.state.buzzed === 'A', 'first buzz wins the toss-up attempt');
    const frozen = a.state.board; await wait(150); ok(a.state.board === frozen, 'reveal pauses while solving');
    a.emit('player:solve', { guess: 'nope' }); await wait(50); ok(host.state.lockedOut.includes('A') && !host.state.buzzed, 'wrong toss-up locks out player, reveal resumes');
    b.emit('player:buzz'); await wait(40); b.emit('player:solve', { guess: room.puzzle.text }); await wait(60);
    ok(room.players.B.total === 3300, 'toss-up solve +$1,000');
    host.emit('host:next', { type: 'round' }); await wait(60); ok(host.state.turn === 'B', 'toss-up winner starts next round');
    // bonus
    host.emit('host:next', { type: 'bonus' }); await wait(80);
    ok(host.state.phase === 'bonus' && host.state.bonus.player === 'B' && ['R', 'S', 'T', 'L', 'N', 'E'].every(l => host.state.used.includes(l)), 'bonus round for leader, RSTLNE given');
    ok((await call(b, 'player:bonusPicks', { consonants: ['R', 'B', 'C'], vowel: 'A' })).error, 'bonus rejects already-given letters');
    const bp = await call(b, 'player:bonusPicks', { consonants: ['M', 'D', 'P'], vowel: 'O' }); await wait(50); ok(bp.ok && host.state.bonus.endsAt, 'bonus picks accepted, timer started');
    await wait(1200); ok(host.state.awaiting === 'bonusJudge', '10s (test: 1s) timer expires to host judgement');
    host.emit('host:judge', { correct: true }); await wait(60); ok(room.players.B.total === 3300 + 25000 && host.state.phase === 'over', 'host judges bonus win: +$25,000');
    // leak audit: players never see an unsolved answer
    const leaks = [...a.all, ...b.all].map(JSON.parse).filter(s => s.answer && !s.solved);
    ok(leaks.length === 0, `no unsolved answers in ${a.all.length + b.all.length} player messages`);
  } catch (e) { failN++; console.error(e); }
  console.log(`\nWheel: ${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
});
