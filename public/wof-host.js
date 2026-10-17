const socket = io('/wof'); let S = null, wheelDrawn = false, lastSpinAt = 0, timerInt;
let host = JSON.parse(sessionStorage.getItem('bw-wof-host') || 'null');
const $ = id => document.getElementById(id); const emit = (e, d) => socket.emit(e, d || {});
socket.on('connect', () => socket.emit('host:create', host || {}, r => { host = r; sessionStorage.setItem('bw-wof-host', JSON.stringify(r)); }));
socket.on('errorMsg', toast); socket.on('state', s => { S = s; render(); });
const nm = id => (S.players.find(p => p.id === id) || {}).name || '';
function render() {
  if (!wheelDrawn) { $('wheel').innerHTML = wheelSVG(S.wheel); wheelDrawn = true; $('wheelRot').style.transform = `rotate(${S.rotation}deg)`; }
  if (S.spin && S.spin.at !== lastSpinAt) { lastSpinAt = S.spin.at; const g = $('wheelRot');
    g.style.transition = `transform ${S.spin.ms}ms cubic-bezier(.12,.6,.15,1)`; requestAnimationFrame(() => g.style.transform = `rotate(${S.spin.rotation}deg)`); }
  $('barinfo').innerHTML = `<span class="muted">Join at <b>${location.host}/wof/play</b></span><span class="code-chip">${S.code}</span>`;
  $('board').innerHTML = boardHTML(S.board || '');
  $('cat').textContent = S.category || (S.phase === 'lobby' ? 'Wheel of Fortune' : '');
  $('msg').textContent = S.message || '';
  $('used').innerHTML = S.phase === 'round' || S.phase === 'bonus' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `<span class="${S.used.includes(l) ? 'u' : ''}">${l}</span>`).join('') : '';
  $('players').innerHTML = S.players.map(p => `<div class="wp ${p.id === S.turn && S.phase === 'round' ? 'turn' : ''} ${p.connected ? '' : 'off'}"><b>${esc(p.name)}</b><div class="bk">${money(p.bank)}</div><div class="tt">Total ${money(p.total)}</div>
    <div class="row" style="justify-content:center;margin-top:6px"><button class="btn btn-ghost btn-sm" onclick="adj('${p.id}')">± fix</button></div></div>`).join('') || '<p class="muted" style="text-align:center">Waiting for 2–4 players to join…</p>';
  $('answer').innerHTML = S.answer && !S.solved ? `Host only — answer: <b class="gold">${esc(S.answer)}</b>` : '';
  const lg = S.lastGuess && !S.solved ? `<p class="muted">Last guess (${esc(nm(S.lastGuess.pid))}): “${esc(S.lastGuess.guess)}”</p>` : '';
  let c = (!S.board || S.solved || S.phase === 'lobby' ? hostModeToggle(S.hostMode, 'host:mode', { player: 'The host plays too: this screen never shows the puzzle answer. Typed solves are checked automatically; tiles reveal when solved.', dedicated: 'A non-player runs the game: the answer is shown on this screen (host only).' }) : '') +
    `<div class="row" style="justify-content:center"><button class="btn btn-gold" onclick="emit('host:next',{type:'tossup'})">Toss-Up</button>
    <button class="btn btn-gold" onclick="emit('host:next',{type:'round'})">${S.phase === 'lobby' ? 'Start Round 1' : 'Next Puzzle'}</button>
    <button class="btn btn-ghost" onclick="emit('host:next',{type:'bonus'})">Bonus Round</button></div>`;
  if (S.phase === 'round' && !S.solved) c += `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="emit('host:skip')">Skip turn</button>
    ${S.lastGuess ? `<button class="btn btn-green btn-sm" onclick="emit('host:judge',{correct:true})">Accept last guess</button>` : ''}
    ${S.players.map(p => `<button class="btn btn-ghost btn-sm" onclick="if(confirm('Award puzzle to ${esc(p.name)}?'))emit('host:judge',{correct:true,pid:'${p.id}'})">Award ${esc(p.name)}</button>`).join('')}</div>${lg}`;
  if (S.phase === 'tossup' && !S.solved) c += `<p class="muted" style="text-align:center">${S.buzzed ? `${esc(nm(S.buzzed))} is solving on their phone… or judge them yourself:` : 'Tiles reveal automatically.'}</p>
    ${S.buzzed ? `<div class="row" style="justify-content:center"><button class="btn btn-green btn-sm" onclick="emit('host:judge',{correct:true,pid:'${S.buzzed}'})">✓ Correct</button></div>` : ''}${lg}`;
  if (S.phase === 'bonus') {
    if (S.bonus && !S.bonus.picks) c += `<p class="muted" style="text-align:center">Bonus player:</p><div class="row" style="justify-content:center">${S.players.map(p => `<button class="btn btn-sm ${p.id === S.bonus.player ? 'btn-gold' : 'btn-ghost'}" onclick="emit('host:bonusPlayer',{pid:'${p.id}'})">${esc(p.name)}</button>`).join('')}</div>`;
    if (S.bonus && S.bonus.picks && !S.solved) c += `<div class="timer" id="timer"></div><div class="row" style="justify-content:center"><button class="btn btn-green" onclick="emit('host:judge',{correct:true})">✓ Solved</button><button class="btn btn-red" onclick="emit('host:judge',{correct:false})">✗ Not solved</button></div>${lg}`;
  }
  $('controls').innerHTML = c;
  clearInterval(timerInt);
  if (S.bonus && S.bonus.endsAt && !S.solved) { const skew = Date.now() - S.now; const tick = () => { const t = $('timer'); if (t) t.textContent = Math.max(0, Math.ceil((S.bonus.endsAt + skew - Date.now()) / 1000)); }; tick(); timerInt = setInterval(tick, 200); }
}
function adj(pid) { const f = confirm('OK = adjust TOTAL score, Cancel = adjust ROUND bank') ? 'total' : 'bank'; const d = prompt(`Change ${nm(pid)}'s ${f} by (e.g. 500 or -500):`); if (d) emit('host:adjust', { pid, field: f, delta: +d }); }
