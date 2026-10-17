// Shared read-aloud module (Jeopardy + Family Feud): natural voice ranking, picker, Test voice, remembered choice.
// ---- Read-aloud voice: pick the most natural available English voice (user choice remembered) ----
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
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  VOICES = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang || '')).sort((a, b) => voiceScore(b) - voiceScore(a));
  const sel = document.getElementById('voicesel'); if (sel) sel.outerHTML = voicePicker();
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.addEventListener('voiceschanged', loadVoices); }
function bestVoice() { const saved = localStorage.getItem('bw-voice'); return VOICES.find(v => v.name === saved) || VOICES[0] || null; }
function utter(text) { const u = new SpeechSynthesisUtterance(text), v = bestVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.95; u.pitch = 1.0; return u; }
function setVoice(name) { localStorage.setItem('bw-voice', name); }
function testVoice() { if (!('speechSynthesis' in window)) return alert('This browser has no speech support.'); speechSynthesis.cancel(); speechSynthesis.speak(utter('This is the clue for 400 dollars. Buzz in when I finish reading.')); }
const escV = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function voicePicker() {
  if (!('speechSynthesis' in window)) return '<span id="voicesel" class="muted">No read-aloud support in this browser</span>';
  const cur = bestVoice();
  return `<span id="voicesel"><select onchange="setVoice(this.value)" style="max-width:320px">${VOICES.map(v => `<option value="${escV(v.name)}" ${cur && v.name === cur.name ? 'selected' : ''}>${escV(v.name)} (${escV(v.lang)})${voiceScore(v) >= 100 ? ' ★' : ''}</option>`).join('') || '<option>Default voice</option>'}</select></span>`;
}
function voiceCard() { return `<div class="card" style="margin:10px 0"><b>🔊 Read-aloud voice</b> <span class="muted">(player-host mode)</span><div class="row" style="margin-top:8px">${voicePicker()}<button class="btn btn-ghost btn-sm" onclick="testVoice()">Test voice</button></div></div>`; }
