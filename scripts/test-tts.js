// Neural read-aloud endpoint (/api/tts): host-key protected, clue-id only, cached, capped, rate-limited, MP3. TTS engine is mocked.
require('./autogo');
process.env.FF_READ_MS = process.env.FF_READ_MS || '1';
const fs = require('fs'), path = require('path');
const tts = require('../lib/tts');
const calls = []; let failNext = false;
tts._setImpl(async (text, voice) => { calls.push({ text, voice }); if (failNext) { failNext = false; throw new Error('boom'); } return Buffer.from('ID3' + 'x'.repeat(800)); });
const { server, rooms, ff } = require('../server.js');
const { io } = require('socket.io-client');
let pass = 0, failN = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { failN++; console.log('  ✗ ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms)); const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`, get = q => fetch(base + '/api/tts?' + new URLSearchParams(q));
  const mk = ns => { const s = io(base + (ns || ''), { transports: ['websocket'], forceNew: true }); s.on('state', x => s.state = x); return s; };
  try {
    console.log('TTS');
    const v = await (await fetch(base + '/api/tts/voices')).json();
    ok(v.voices.length >= 7 && v.default === 'en-US-AndrewMultilingualNeural' && ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-CA-ClaraNeural', 'en-CA-LiamNeural', 'en-US-AvaMultilingualNeural'].every(id => v.voices.some(x => x.id === id)), `voice list (${v.voices.length}) defaults to Andrew Multilingual`);
    let r = await get({ sample: 1, voice: 'en-US-AvaMultilingualNeural' });
    ok(r.status === 200 && r.headers.get('content-type') === 'audio/mpeg' && (await r.arrayBuffer()).byteLength > 500, 'Test-voice sample returns MP3');
    ok(calls.at(-1).voice === 'en-US-AvaMultilingualNeural', 'chosen voice is used');
    await get({ sample: 1, voice: 'evil<script>' }); ok(calls.at(-1).voice === tts.DEFAULT_VOICE, 'unknown voice falls back to the default');
    ok((await get({ text: 'say anything', game: 'jp' })).status === 404, 'arbitrary text is never spoken');
    // Jeopardy
    const H = mk(), A = mk(); const { code, hostKey } = await call(H, 'host:create', {});
    await call(A, 'player:join', { code, name: 'Ann', pid: 'pAnn' });
    H.emit('host:mode', { mode: 'player' }); H.emit('host:selectBoard', { boardId: 'jackpot' }); H.emit('host:start'); await wait(120);
    const room = rooms[code], q02 = room.board.rounds[0][1].clues[2].q;
    ok((await get({ game: 'jp', room: code, key: 'wrong' })).status === 404, 'wrong host key is refused');
    ok((await get({ game: 'jp', room: code, key: hostKey })).status === 404, 'nothing to read before a clue is open');
    const n0 = calls.length; r = await get({ game: 'jp', room: code, key: hostKey, clue: '0-1-2' });
    ok(r.status === 200 && calls.at(-1).text === q02, 'pre-fetch by clue id speaks that clue');
    ok((await get({ game: 'jp', room: code, key: hostKey, clue: '0-9-9' })).status === 404 && (await get({ game: 'jp', room: code, key: hostKey, clue: '1-0-0' })).status === 404, 'invalid / other-round clue ids refused');
    H.emit('host:open', { c: 1, r: 2 }); await wait(60);
    ok(H.state.current && H.state.current.reading && H.state.current.speak === q02, 'opened clue is reading');
    r = await get({ game: 'jp', room: code, key: hostKey });
    ok(r.status === 200 && calls.length === n0 + 1, 'current clue served from cache (no second synth)');
    A.emit('player:buzz'); await wait(60); ok(!H.state.current.reading && H.state.current.buzzed, 'a buzz still cuts the reading off');
    H.emit('host:close'); await wait(40); if (room.current) { room.used.add('0-1-2'); room.current = null; }
    ok((await get({ game: 'jp', room: code, key: hostKey, clue: '0-1-2' })).status === 404, 'used clue can no longer be fetched');
    // Feud: current + next-question pre-fetch
    const F = mk('/ff'), FA = mk('/ff'), FB = mk('/ff'); const fr = await call(F, 'host:create', {});
    F.emit('host:mode', { mode: 'player' });
    await call(FA, 'player:join', { code: fr.code, name: 'A', pid: 'a1', team: 0 }); await call(FB, 'player:join', { code: fr.code, name: 'B', pid: 'b1', team: 1 });
    ok((await get({ game: 'ff', room: fr.code, key: fr.hostKey, next: 1 })).status === 404, 'Feud: no pre-fetch before the game starts');
    F.emit('host:startRound'); await wait(80);
    const froom = ff.rooms[fr.code];
    r = await get({ game: 'ff', room: fr.code, key: fr.hostKey }); ok(r.status === 200 && calls.at(-1).text === froom.round.survey.q, 'Feud: face-off question is spoken');
    r = await get({ game: 'ff', room: fr.code, key: fr.hostKey, next: 1 }); const nextQ = calls.at(-1).text;
    ok(r.status === 200 && nextQ !== froom.round.survey.q, 'Feud: next question can be pre-fetched');
    F.emit('host:skipRound'); await wait(40); F.emit('host:startRound'); await wait(80);
    ok(froom.round.survey.q === nextQ, 'Feud: the pre-fetched question is the one actually asked next');
    // engine failure, text cap
    failNext = true; ok((await get({ sample: 1, voice: 'en-GB-RyanNeural' })).status === 502, 'engine failure -> 502 (client falls back to browser speech)');
    await tts.synth('word '.repeat(500), tts.DEFAULT_VOICE); ok(calls.at(-1).text.length <= tts.MAX_CHARS, `text capped at ${tts.MAX_CHARS} chars`);
    // client wiring
    const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
    const sp = pub('speech.js'), hj = pub('host.js'), fj = pub('ff-host.js');
    ok(/onended[\s\S]*ok\(\)/.test(sp) && /speechSynthesis\.speak/.test(sp) && /onerror/.test(sp) && /7000/.test(sp), 'speech.js: done only on audio "ended"; falls back to browser speech on error / timeout');
    ok(/readAloud\(ttsParams\(\), c\.speak, done\)/.test(hj) && /isReading\(\)\) stopReading\(\)/.test(hj) && /prefetchRead/.test(hj) && /data-clue/.test(hj), 'Jeopardy host: neural read, stop on buzz, hover pre-fetch');
    ok(/readAloud\(p, S\.speak, done\)/.test(fj) && /stopReading\(\)/.test(fj) && /next: 1/.test(fj), 'Feud host: neural read, stop on buzz, next-question pre-fetch');
    // rate limit (last: it uses up this IP's budget)
    let limited = false; for (let i = 0; i < 45 && !limited; i++) if ((await get({ sample: 1 })).status === 429) limited = true;
    ok(limited, 'rate limited (429) after 40 requests / minute');
    [H, A, F, FA, FB].forEach(s => s.close());
  } catch (e) { failN++; console.log('  ✗ crashed', e); }
  console.log(`TTS tests: ${pass} passed, ${failN} failed`); server.close(); process.exit(failN ? 1 : 0);
});
