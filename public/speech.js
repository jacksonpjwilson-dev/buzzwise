// Shared read-aloud module (Jeopardy + Family Feud).
// Primary engine: server-generated neural voices (/api/tts, MP3 played in an <audio> element).
// Fallback: the browser's speechSynthesis (best available English voice). The choice is remembered.
// ---- browser voices (fallback) ----
let VOICES = [];
function voiceScore(v) {
  let sc = 0; const n = v.name, l = (v.lang || '').replace('_', '-');
  if (!/^en/i.test(l)) return -1000;
  if (/natural|neural|premium|enhanced|online/i.test(n)) sc += 100;
  if (/google us english/i.test(n)) sc += 60;
  if (/samantha|ava|zoe/i.test(n)) sc += 40;
  if (/en-CA|en-US/i.test(l)) sc += 20;
  if (/compact|espeak/i.test(n)) sc -= 50;
  return sc;
}
function loadVoices() { if (!('speechSynthesis' in window)) return; VOICES = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang || '')).sort((a, b) => voiceScore(b) - voiceScore(a)); }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.addEventListener('voiceschanged', loadVoices); }
function bestVoice() { const saved = localStorage.getItem('bw-voice'); return VOICES.find(v => v.name === saved) || VOICES[0] || null; }
function utter(text) { const u = new SpeechSynthesisUtterance(text), v = bestVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.95; u.pitch = 1.0; return u; }

// ---- neural voices (primary) ----
let NEURAL = [{ id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (US, warm male)' }, { id: 'en-US-AvaMultilingualNeural', label: 'Ava (US, bright female)' }];
let NEURAL_DEFAULT = 'en-US-AndrewMultilingualNeural';
fetch('/api/tts/voices').then(r => r.json()).then(j => { NEURAL = j.voices; NEURAL_DEFAULT = j.default; const s = document.getElementById('voicesel'); if (s) s.outerHTML = voicePicker(); }).catch(() => {});
const currentVoice = () => localStorage.getItem('bw-tts-voice') || NEURAL_DEFAULT; // 'browser' = use speechSynthesis only
function setVoice(id) { localStorage.setItem('bw-tts-voice', id); }
function ttsUrl(params) { return '/api/tts?' + new URLSearchParams({ ...params, voice: currentVoice() }).toString(); }

const ttsAudio = new Audio(); ttsAudio.preload = 'auto';
let readToken = 0; // bumps on every new read / stop so stale callbacks never fire
const READ_STATS = { neural: 0, browser: 0, failed: 0 }; window.BW_READ_STATS = READ_STATS;
function stopReading() {
  readToken++; try { ttsAudio.pause(); ttsAudio.removeAttribute('src'); ttsAudio.load(); } catch (e) {}
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function isReading() { return (!ttsAudio.paused && !ttsAudio.ended && ttsAudio.currentSrc) || ('speechSynthesis' in window && speechSynthesis.speaking); }
// Read `text` aloud. `params` identifies the text for /api/tts (room/key/game/clue). onDone fires ONLY after a full, uninterrupted reading.
function readAloud(params, text, onDone) {
  stopReading(); const tok = readToken; let started = false, settled = false;
  const ok = () => { if (tok !== readToken || settled) return; settled = true; onDone && onDone(); };
  const browser = () => {
    if (tok !== readToken || settled) return; READ_STATS.browser++;
    try { ttsAudio.pause(); } catch (e) {}
    if (!('speechSynthesis' in window) || !text) return setTimeout(ok, 1500);
    speechSynthesis.cancel(); const u = utter(text); u.onend = ok; u.onerror = ok; speechSynthesis.speak(u);
  };
  if (currentVoice() === 'browser' || !params) return browser();
  ttsAudio.onended = () => { if (tok === readToken) { READ_STATS.neural++; ok(); } };
  ttsAudio.onerror = () => { if (tok === readToken && !settled) { READ_STATS.failed++; browser(); } };
  ttsAudio.onplaying = () => { started = true; };
  ttsAudio.src = ttsUrl(params);
  const p = ttsAudio.play(); if (p && p.catch) p.catch(e => { if (tok === readToken && !settled && !started) { READ_STATS.failed++; browser(); } });
  setTimeout(() => { if (tok === readToken && !started && !settled) { READ_STATS.failed++; browser(); } }, 7000); // slow / stuck download
}
// Warm the server + browser cache for audio we will probably need next.
const prefetched = new Set();
function prefetchRead(params) { if (currentVoice() === 'browser' || !params) return; const u = ttsUrl(params); if (prefetched.has(u)) return; prefetched.add(u); if (prefetched.size > 200) prefetched.clear(); fetch(u).catch(() => prefetched.delete(u)); }

function testVoice() { readAloud({ sample: 1 }, 'This is the clue for 400 dollars. Buzz in when I finish reading.'); }
const escV = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function voicePicker() {
  const cur = currentVoice();
  return `<span id="voicesel"><select aria-label="Read-aloud voice" onchange="setVoice(this.value)" style="max-width:320px"><optgroup label="Natural voices (recommended)">${NEURAL.map(v => `<option value="${escV(v.id)}" ${v.id === cur ? 'selected' : ''}>★ ${escV(v.label)}</option>`).join('')}</optgroup>
    <optgroup label="Offline"><option value="browser" ${cur === 'browser' ? 'selected' : ''}>This device's built-in voice</option></optgroup></select></span>`;
}
function voiceCard() { return `<div class="card" style="margin:10px 0"><b>🔊 Read-aloud voice</b> <span class="muted">(player-host mode)</span><div class="row" style="margin-top:8px">${voicePicker()}<button class="btn btn-ghost btn-sm" onclick="testVoice()">Test voice</button></div></div>`; }
