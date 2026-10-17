// Shared client helpers for Password / Cards Against Everyone / Priorities.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }
const pname = id => (S && S.players.find(p => p.id === id) || {}).name || '?';
function countdown(endsAt, now, el) { const skew = Date.now() - now; clearInterval(countdown.t); const tick = () => { const e = $(el); if (e) e.textContent = Math.max(0, Math.ceil((endsAt + skew - Date.now()) / 1000)); }; tick(); countdown.t = setInterval(tick, 200); }
let S = null;
// Host page boot: (ns, storageKey, render, label)
function partyHost(ns, render, playPath) {
  const key = 'bw-' + ns.slice(1) + '-host'; let host = JSON.parse(sessionStorage.getItem(key) || 'null');
  const socket = io(ns); window.socket = socket;
  socket.on('connect', () => socket.emit('host:create', host || {}, r => { host = r; sessionStorage.setItem(key, JSON.stringify(r)); }));
  socket.on('state', s => { if (GR(s, true)) return; S = s; if ($('barinfo')) $('barinfo').innerHTML = `<span class="muted">Join at <b>${location.host}${playPath}</b></span><span class="code-chip">${S.code}</span>`; render(); });
  socket.on('errorMsg', toast);
  window.emit = (e, d, cb) => socket.emit(e, d || {}, cb || (r => r && r.error && toast(r.error)));
  return socket;
}
// Phone page boot: enter-code screen, Rejoin button, stale-session cleanup (same rules as the other modes)
function partyPlay(ns, title, render) {
  const game = ns.slice(1), skey = 'bw-' + game + '-join';
  let pid = localStorage.getItem('bw-pid') || Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bw-pid', pid);
  let saved = JSON.parse(localStorage.getItem(skey) || 'null'), joined = false; const qcode = new URLSearchParams(location.search).get('code');
  const socket = io(ns); window.socket = socket; window.myId = pid;
  function joinForm(err) {
    $('view').innerHTML = `<h1 style="font-size:38px;margin:10px 0">${esc(title)}</h1><p class="muted">Enter the code on the big screen.</p><form id="jf" style="display:grid;gap:12px;margin-top:16px">
    <input id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-size:26px;text-align:center;font-weight:800" value="${esc(qcode || '')}">
    <input id="name" maxlength="14" placeholder="Your name" value="${esc((saved && saved.name) || '')}"><button class="btn btn-gold">Join game</button>${!qcode ? BWJ.rejoinHtml(saved) : ''}<p class="status" style="color:var(--red)">${esc(err || '')}</p></form>`;
    if ($('rj')) { $('rj').onclick = () => join(saved.code, saved.name); BWJ.verify(game, skey, saved, () => { saved = null; const b = $('rj'); if (b) b.remove(); }); }
    $('jf').onsubmit = e => { e.preventDefault(); join($('code').value, $('name').value); };
  }
  function join(code, name) { socket.emit('player:join', { code, name, pid }, r => {
    if (r.error) { if (BWJ.isStale(r.error) && saved && saved.code === String(code).trim().toUpperCase()) { localStorage.removeItem(skey); saved = null; } joined = false; return joinForm(r.error); }
    joined = true; saved = { code: r.code, name }; localStorage.setItem(skey, JSON.stringify(saved)); }); }
  socket.on('connect', () => saved && (joined || (qcode && qcode.toUpperCase() === saved.code)) ? join(saved.code, saved.name) : joinForm());
  socket.on('state', s => { if (GR(s, false)) return; S = s; if ($('me')) $('me').innerHTML = s.me ? `<b>${esc(s.me.name)}</b><span class="code-chip">${s.me.score}</span>` : ''; render(); });
  socket.on('errorMsg', toast);
  socket.on('kicked', () => { localStorage.removeItem(skey); saved = null; joined = false; joinForm('You were removed by the host.'); });
  window.send = (e, d, cb) => socket.emit(e, d || {}, cb || (r => r && r.error && toast(r.error)));
  return socket;
}
function scoreList() { return `<div class="card" style="padding:14px">${[...S.players].sort((a, b) => b.score - a.score).map(p => `<div class="score-row"><span class="n">${p.connected === false ? '⚪ ' : ''}${esc(p.name)}</span><span class="s">${p.score}</span></div>`).join('') || '<p class="muted">No players yet</p>'}</div>`; }
