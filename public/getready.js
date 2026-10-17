// 'Get ready' overlay for every mode. Returns true while the room is gated (page render is skipped).
function GR(s, isHost) {
  let o = document.getElementById('gr');
  if (!s || s.phase !== 'getready') { if (o) o.remove(); return false; }
  if (!o) { o = document.createElement('div'); o.id = 'gr'; document.body.appendChild(o); }
  const e = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g = s.getReady || {};
  o.innerHTML = `<div class="gr-box"><div class="gr-kicker">GET READY</div><div class="gr-title">${e(g.title)}</div>
    ${(g.lines || []).map(l => `<div class="gr-line">${e(l)}</div>`).join('')}
    ${(s.scores || []).length ? `<div class="gr-scores">${s.scores.map(x => `<div class="score-row"><span class="n">${e(x.name)}</span><span class="s">${e(x.score)}</span></div>`).join('')}</div>` : ''}
    ${isHost ? `<button class="btn btn-gold gr-go" onclick="socket.emit('host:go',{})">▶ Start</button>` : '<p class="status">Waiting for the host to start…</p>'}
    ${s.code ? `<div class="muted" style="margin-top:10px">Code <b class="gold">${e(s.code)}</b></div>` : ''}</div>`;
  return true;
}
