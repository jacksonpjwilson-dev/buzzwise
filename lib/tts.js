// Server-side neural read-aloud (Microsoft Edge online voices via msedge-tts, no API key).
// Only speaks text the server already knows (clue / survey looked up by room + hostKey); results are cached in memory.
const VOICES = [
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (US, warm male)' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava (US, bright female)' },
  { id: 'en-US-AriaNeural', label: 'Aria (US, female)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (US, female)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US, male)' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian (US, male)' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma (US, female)' },
  { id: 'en-CA-ClaraNeural', label: 'Clara (Canada, female)' },
  { id: 'en-CA-LiamNeural', label: 'Liam (Canada, male)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK, female)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK, male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (Australia, female)' },
];
const DEFAULT_VOICE = VOICES[0].id, MAX_CHARS = 600, CACHE_MAX = 400;
const SAMPLE = 'This is the clue for four hundred dollars. Buzz in when I finish reading.';
const cache = new Map(), inflight = new Map();
// a few bytes that browsers will reject quickly -> exercises the client fallback; tests set TTS_MOCK=1
const MOCK = Buffer.from('ID3mock-mp3', 'latin1');

function synthReal(text, voice) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  return new Promise(async (resolve, reject) => {
    const tts = new MsEdgeTTS(); let done = false;
    const finish = (err, buf) => { if (done) return; done = true; clearTimeout(to); try { tts.close(); } catch (e) {} err ? reject(err) : resolve(buf); };
    const to = setTimeout(() => finish(new Error('tts timeout')), 15000);
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text); const chunks = [];
      audioStream.on('data', c => chunks.push(c));
      audioStream.on('end', () => { const b = Buffer.concat(chunks); b.length > 500 ? finish(null, b) : finish(new Error('empty audio')); });
      audioStream.on('error', finish);
    } catch (e) { finish(e); }
  });
}
let synthImpl = (text, voice) => process.env.TTS_MOCK ? Promise.resolve(MOCK) : synthReal(text, voice);
function synth(text, voice) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!VOICES.some(v => v.id === voice)) voice = DEFAULT_VOICE;
  const key = voice + '|' + text;
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return Promise.resolve(b); }
  if (inflight.has(key)) return inflight.get(key);
  const p = synthImpl(text, voice).then(b => { cache.set(key, b); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); return b; }).finally(() => inflight.delete(key));
  inflight.set(key, p); return p;
}
// simple per-IP token bucket: 40 requests / minute
const buckets = new Map();
function allow(ip) { const now = Date.now(); let b = buckets.get(ip); if (!b || now - b.t > 60000) { b = { t: now, n: 0 }; buckets.set(ip, b); } b.n++; if (buckets.size > 5000) buckets.clear(); return b.n <= 40; }

// resolvers: (query) -> text | null, keyed by game
function mount(app, resolvers) {
  app.get('/api/tts/voices', (req, res) => res.json({ voices: VOICES, default: DEFAULT_VOICE }));
  app.get('/api/tts', async (req, res) => {
    if (!allow(req.ip)) return res.status(429).json({ error: 'Too many requests' });
    let text = null;
    if (req.query.sample) text = SAMPLE;
    else { const r = resolvers[req.query.game]; text = r ? r(req.query) : null; }
    if (!text) return res.status(404).json({ error: 'Nothing to read' });
    try {
      const buf = await synth(text, String(req.query.voice || ''));
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600', 'Content-Length': buf.length }).end(buf);
    } catch (e) { res.status(502).json({ error: 'TTS unavailable' }); }
  });
}
module.exports = { mount, synth, VOICES, DEFAULT_VOICE, SAMPLE, MAX_CHARS, _setImpl: f => { synthImpl = f; }, _cache: cache };
