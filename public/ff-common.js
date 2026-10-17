// Shared Family Feud rendering (board never contains unrevealed answer text — server doesn't send it)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }
function ffBoard(round) {
  const slots = []; for (let i = 0; i < 8; i++) { const a = round && round.board[i];
    slots.push(!a ? '<div class="ff-slot empty"></div>' : a.text ? `<div class="ff-slot shown"><span>${esc(a.text)}</span><b>${a.points}</b></div>` : `<div class="ff-slot hidden"><span>${a.n}</span></div>`); }
  return `<div class="ff-board">${slots.join('')}</div>`;
}
let AC; const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
function tone(f, d, type = 'square', v = .12) { try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(a.destination); g.gain.value = v; o.start(); o.stop(a.currentTime + d); } catch (e) {} }
function showX(n) { const d = document.createElement('div'); d.className = 'bigx'; d.innerHTML = '<span>✕</span>'.repeat(Math.min(3, n || 1)); document.body.append(d); tone(110, .55, 'sawtooth', .2); setTimeout(() => d.remove(), 1000); }
function ding() { tone(880, .12, 'sine', .2); setTimeout(() => tone(1320, .25, 'sine', .2), 120); }
function countdown(endsAt, now, el) { const skew = Date.now() - now; clearInterval(countdown.t); const tick = () => { const e = document.getElementById(el); if (e) e.textContent = Math.max(0, Math.ceil((endsAt + skew - Date.now()) / 1000)); }; tick(); countdown.t = setInterval(tick, 200); }
