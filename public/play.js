const socket = io();
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
let S = null, joined = false;
let pid = localStorage.getItem('bw-pid') || Math.random().toString(36).slice(2) + Date.now().toString(36);
localStorage.setItem('bw-pid', pid);
let saved = JSON.parse(localStorage.getItem('bw-join') || 'null');
const qcode = new URLSearchParams(location.search).get('code');

function joinForm(err) {
  $('view').innerHTML = `<h1 style="font-size:40px;margin:10px 0">Join a game</h1><p class="muted">Enter the code shown on the host's screen.</p>
  <form id="jf" style="display:grid;gap:12px;margin-top:20px">
  <input id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-size:26px;text-align:center;font-weight:800" value="${esc(qcode || '')}">
  <input id="name" maxlength="16" placeholder="Your name" value="${esc((saved && saved.name) || '')}">
  <button class="btn btn-gold">Join game</button>${!qcode ? BWJ.rejoinHtml(saved) : ''}<p class="status" style="color:var(--red)">${esc(err || '')}</p></form>`;
  if ($('rj')) { $('rj').onclick = () => join(saved.code, saved.name); BWJ.verify('jp', 'bw-join', saved, () => { saved = null; const b = $('rj'); if (b) b.remove(); }); }
  $('jf').onsubmit = e => { e.preventDefault(); join($('code').value, $('name').value); };
}
function join(code, name) {
  socket.emit('player:join', { code, name, pid }, res => {
    if (res.error) { if (BWJ.isStale(res.error) && saved && saved.code === String(code).trim().toUpperCase()) { localStorage.removeItem('bw-join'); saved = null; } joined = false; return joinForm(res.error); }
    joined = true; saved = { code: res.code, name }; localStorage.setItem('bw-join', JSON.stringify(saved));
  });
}
socket.on('connect', () => { if (saved && (joined || (qcode && qcode.toUpperCase() === saved.code))) join(saved.code, saved.name); else joinForm(); });
socket.on('state', s => { if (GR(s, false)) return; S = s; render(); });
socket.on('kicked', () => { localStorage.removeItem('bw-join'); saved = null; joined = false; joinForm('You were removed by the host.'); });
let lastBuzz = 0;
function buzz() { if (Date.now() - lastBuzz < 150) return; lastBuzz = Date.now(); navigator.vibrate && navigator.vibrate(60); socket.emit('player:buzz'); }

function render() {
  if (!S || !S.me) return;
  $('me').innerHTML = `<b>${esc(S.me.name)}</b><span class="code-chip" style="font-size:16px">${money(S.me.score)}</span>`;
  const v = $('view'), me = S.me.id, c = S.current;
  const key = JSON.stringify([S.phase, c && [c.category, c.value, c.wager, c.ddPlayer, c.buzzed, c.buzzOpen, c.reading, c.peeked, c.revealed, c.lockedOut, c.result && 1], S.final && [S.final.stage, S.final.myWager, S.final.myAnswer]]);
  const ae = document.activeElement; if (ae && ae.tagName === 'INPUT' && v.contains(ae) && key === render.key) return; render.key = key;
  const standings = `<div class="card" style="margin-top:24px">${[...S.players].sort((a, b) => b.score - a.score).map((p, i) =>
    `<div class="score-row ${p.id === me ? 'ctrl' : ''}"><span class="n">${i + 1}. ${esc(p.name)}</span><span class="s ${p.score < 0 ? 'neg' : ''}">${money(p.score)}</span></div>`).join('')}</div>`;
  if (S.phase === 'lobby') return v.innerHTML = `<div class="big" style="margin-top:30px">You're in! 🎉</div><p class="status">Waiting for the host to pick a board and start.</p>${standings}`;
  if (S.phase === 'final' || S.phase === 'over') return finalView(v, standings);
  if (!c) {
    const ctrl = S.players.find(p => p.id === S.controller);
    const msg = S.phase === 'roundEnd' ? 'Round complete!' : ctrl ? (ctrl.id === me ? 'Your pick! Tell the host.' : `${esc(ctrl.name)} is picking…`) : 'Host is picking a clue…';
    return v.innerHTML = `<div class="pboard-head"><span class="tag t-medium">${S.round === 0 ? 'Jeopardy Round' : 'Double Jeopardy'}</span><span class="muted">${esc(S.boardName || '')}</span></div>
    <div class="pgrid">${S.grid.map(g => `<div class="pcat">${esc(g.name)}</div>`).join('')}
    ${[0, 1, 2, 3, 4].map(r => S.grid.map(g => `<div class="pcell ${g.clues[r].used ? 'used' : ''}">${g.clues[r].used ? '' : '$' + g.clues[r].value}</div>`).join('')).join('')}</div>
    <p class="big" style="font-size:20px;margin-top:14px">${msg}</p>${standings}`;
  }
  const head = `<p class="status" style="margin-top:12px"><b class="gold">${esc(c.category)}</b> · ${c.dd ? 'Daily Double' : '$' + c.value}</p>`;
  if (c.dd && !(S.hostMode === 'player' && c.wager !== null)) {
    if (c.ddPlayer === me && c.wager === null) {
      const max = Math.max(S.me.score, S.round === 0 ? 1000 : 2000);
      v.innerHTML = `${head}<div class="dd" style="font-size:48px;text-align:center">DAILY DOUBLE!</div><p class="status">Wager $5 – ${money(max)}</p>
      <form id="wf" style="display:grid;gap:10px"><input id="w" type="number" min="5" max="${max}" inputmode="numeric" placeholder="Your wager"><button class="btn btn-gold">Lock wager</button></form><p id="werr" class="status"></p>`;
      $('wf').onsubmit = e => { e.preventDefault(); socket.emit('player:ddWager', { amount: +$('w').value }, r => { if (r.error) $('werr').textContent = r.error; }); };
      return;
    }
    const who = S.players.find(p => p.id === c.ddPlayer);
    return v.innerHTML = `${head}<div class="dd" style="font-size:44px;text-align:center">DAILY DOUBLE</div>
      <p class="big" style="font-size:22px">${c.ddPlayer === me ? `You wagered ${money(c.wager)}. Answer out loud!` : who ? `${esc(who.name)} ${c.wager === null ? 'is wagering…' : `wagered ${money(c.wager)}`}` : 'Host is choosing a player…'}</p>${standings}`;
  }
  if (S.hostMode === 'player') {
    if (c.revealed) return v.innerHTML = `${head}<p class="big" style="font-size:22px">${c.result && c.result.correct ? (c.result.pid === me ? '✅ Nice! Points added.' : `✅ ${esc((S.players.find(p => p.id === c.result.pid) || {}).name)} got it`) : 'Nobody got it'}</p><p class="status">Answer: <b class="gold">${esc(c.answer || '')}</b></p>${standings}`;
    if (c.buzzed === me) {
      v.innerHTML = c.peeked ? `${head}<p class="status">Only you can see this:</p><div class="big gold" id="myans" style="font-size:26px">${esc(c.answer)}</div>
        <p class="status">Did your spoken answer match?</p><div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-green" id="sjc">✓ Correct</button><button class="btn btn-red" id="sjw">✗ Wrong</button></div>`
        : `${head}<p class="big" style="font-size:24px">You buzzed! Say your answer out loud.</p><p class="status">When you're done, the host presses Reveal and the answer will show only on your phone.</p>`;
      if ($('sjc')) $('sjc').onclick = () => socket.emit('player:selfJudge', { correct: true });
      if ($('sjw')) $('sjw').onclick = () => socket.emit('player:selfJudge', { correct: false });
      return;
    }
    if (c.reading && !c.buzzOpen) { v.innerHTML = `${head}<button class="buzzer bz-wait" disabled>🔊</button><p class="status">Listen — the clue is being read aloud…</p>`; return; }
  }
  let cls = 'bz-wait', label = 'WAIT', note = 'Listen to the host…', dis = true;
  if (c.buzzed === me) { cls = 'bz-me'; label = 'YOU!'; note = 'You buzzed first — answer out loud!'; }
  else if (c.lockedOut) { cls = 'bz-out'; label = 'OUT'; note = 'Locked out on this clue.'; }
  else if (c.buzzed) { note = `${esc((S.players.find(p => p.id === c.buzzed) || {}).name)} buzzed in`; }
  else if (c.buzzOpen) { cls = 'bz-live'; label = 'BUZZ'; note = 'Buzzers are live!'; dis = false; }
  v.innerHTML = `${head}<button class="buzzer ${cls}" id="bz" ${dis ? 'disabled' : ''}>${label}</button><p class="status">${note}</p>`;
  $('bz').addEventListener('pointerdown', buzz);
}
function finalView(v, standings) {
  const f = S.final, me = S.me;
  let h = `<p class="status" style="margin-top:12px">Final Jeopardy</p><div class="big gold">${esc(f.category)}</div>`;
  if (f.stage === 'wager') {
    if (f.myWager !== undefined) h += `<p class="big" style="font-size:22px;margin-top:20px">Wager locked: ${money(f.myWager)}</p>`;
    else if (me.score <= 0) h += `<p class="status" style="margin-top:20px">You need a positive score to wager — you can still answer for fun!</p>`;
    else { h += `<p class="status">Wager $0 – ${money(me.score)}. Nobody else can see it.</p><form id="fw" style="display:grid;gap:10px"><input id="w" type="number" min="0" max="${me.score}" inputmode="numeric" placeholder="Secret wager"><button class="btn btn-gold">Lock wager</button></form><p id="ferr" class="status"></p>`; }
  } else if (f.stage === 'answer') {
    if (f.myAnswer !== undefined) h += `<p class="big" style="font-size:22px;margin-top:20px">Answer locked ✔</p><p class="status">“${esc(f.myAnswer)}”</p>`;
    else h += `<p class="status">Listen to the clue, then type your answer.</p><form id="fa" style="display:grid;gap:10px"><input id="a" maxlength="120" placeholder="Your answer" autocomplete="off"><button class="btn btn-gold">Submit answer</button></form><p id="ferr" class="status"></p>`;
  } else h += `<p class="big" style="font-size:22px;margin-top:20px">${S.phase === 'over' ? 'Final results are in!' : 'The host is judging answers…'}</p>`;
  if (S.phase === 'over') { const w = [...S.players].sort((a, b) => b.score - a.score)[0]; h += `<div class="dd" style="font-size:40px;text-align:center">🏆 ${esc(w.name)} wins!</div>`; }
  v.innerHTML = h + standings;
  if ($('fw')) $('fw').onsubmit = e => { e.preventDefault(); socket.emit('player:finalWager', { amount: +$('w').value }, r => r.error && ($('ferr').textContent = r.error)); };
  if ($('fa')) $('fa').onsubmit = e => { e.preventDefault(); socket.emit('player:finalAnswer', { answer: $('a').value }, r => r.error && ($('ferr').textContent = r.error)); };
}
