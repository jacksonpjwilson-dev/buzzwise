const socket = io();
let S = null, BOARDS = [], diff = 'medium', host = JSON.parse(sessionStorage.getItem('bw-host') || 'null');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
const DN = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const name = pid => (S.players.find(p => p.id === pid) || {}).name || '—';
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }
fetch('/api/boards').then(r => r.json()).then(b => { BOARDS = b; render(); });
socket.on('connect', () => socket.emit('host:create', host || {}, res => { host = res; sessionStorage.setItem('bw-host', JSON.stringify(res)); }));
socket.on('state', s => { if (GR(s, true)) return; S = s; render(); });
socket.on('errorMsg', toast);
socket.on('buzz', () => { try { new AudioContext().resume(); beep(); } catch (e) {} });
function beep() { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.value = .15; o.start(); o.stop(a.currentTime + .15); }
const emit = (e, d) => socket.emit(e, d || {});
// ---- Player-host mode: read the clue aloud (Web Speech API) so nobody wins by reading fastest ----
let spokenKey = null;
function speakClue(c) {
  const key = [S.round, c.c, c.r, c.wager, c.readSeq].join('-'); if (spokenKey === key) return; spokenKey = key;
  const seq = c.readSeq, done = () => { if (S.current && S.current.readSeq === seq && S.current.reading) emit('host:readDone', { seq }); };
  readAloud(ttsParams(), c.speak, done);
}
const ttsParams = clue => host && { game: 'jp', room: host.code, key: host.hostKey, ...(clue ? { clue } : {}) };
function repeatClue() { spokenKey = null; if (S.current && S.current.speak) readAloud(ttsParams(), S.current.speak); }
// pre-fetch: when the host points at a square in player-host mode, start generating that clue's audio
document.addEventListener('pointerover', e => { const b = e.target.closest && e.target.closest('[data-clue]'); if (b && S && S.hostMode === 'player') prefetchRead(ttsParams(b.dataset.clue)); });

function scoreboard() {
  const ps = [...S.players].sort((a, b) => b.score - a.score);
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><b>Scoreboard</b><span class="muted">${ps.length} players</span></div>
  ${ps.map(p => `<div class="score-row ${p.id === S.controller ? 'ctrl' : ''} ${p.connected ? '' : 'off'}"><span class="n">${esc(p.name)}</span>
  <span class="row" style="gap:6px"><span class="s ${p.score < 0 ? 'neg' : ''}">${money(p.score)}</span>
  <button class="btn btn-ghost btn-sm" title="Adjust score" onclick="adj('${p.id}')">±</button></span></div>`).join('') || '<p class="muted">Waiting for players…</p>'}
  <p class="muted" style="font-size:13px;margin:10px 0 0">Gold outline = player in control (picks next & gets Daily Doubles).</p></div>`;
}
function adj(pid) { const d = prompt(`Adjust ${name(pid)}'s score by (e.g. 400 or -400):`); if (d) emit('host:adjust', { pid, delta: +d }); }

function render() {
  if (!S) return;
  const ae = document.activeElement, key = JSON.stringify([S.phase, S.current && [S.current.c, S.current.r, S.current.wager, S.current.ddPlayer]]);
  if (ae && ae.tagName === 'INPUT' && key === render.key) return; render.key = key;
  $('barinfo').innerHTML = `${S.board ? `<span class="tag t-${S.board.difficulty}">${DN[S.board.difficulty]}</span><b>${esc(S.board.name)}</b>` : ''}
    <span class="muted">Join at <b>${location.host}/play</b></span><span class="code-chip">${S.code}</span>`;
  $('overlay').innerHTML = '';
  if (S.phase === 'lobby') return lobby();
  if (S.phase === 'final' || S.phase === 'over') return finalView();
  const rname = S.round === 0 ? 'Jeopardy Round' : 'Double Jeopardy';
  $('view').innerHTML = `<div class="main"><div><div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">${rname}</h2>
    ${S.phase === 'roundEnd' ? `<button class="btn btn-gold" onclick="emit('host:nextRound')">${S.round === 0 ? 'Start Double Jeopardy →' : 'Go to Final Jeopardy →'}</button>` :
      `<button class="btn btn-ghost btn-sm" onclick="if(confirm('Skip the rest of this round?'))emit('host:nextRound')">Skip to next round</button>`}</div>
    <div class="grid">${S.grid.map(c => `<div class="cat">${esc(c.name)}</div>`).join('')}
    ${[0, 1, 2, 3, 4].map(r => S.grid.map((c, ci) => `<button class="cell ${c.clues[r].used ? 'used' : ''}" data-clue="${S.round}-${ci}-${r}" ${c.clues[r].used ? 'disabled' : ''} onclick="emit('host:open',{c:${ci},r:${r}})">$${c.clues[r].value}</button>`).join('')).join('')}</div></div>
    <div class="side">${scoreboard()}</div></div>`;
  if (S.current) clueOverlay();
}
function clueOverlay() {
  const c = S.current, cat = S.grid[c.c].name;
  let body;
  if (c.dd && c.wager === null) {
    body = `<div class="dd">DAILY DOUBLE!</div><div class="meta" style="margin-top:12px">${esc(cat)}</div>
    ${c.ddPlayer ? `<p class="buzzline">${esc(name(c.ddPlayer))} is entering a wager on their phone…</p>
      <div class="row"><input id="ddw" type="number" placeholder="or type wager" style="width:180px"><button class="btn btn-ghost" onclick="emit('host:ddWager',{amount:+$('ddw').value})">Set wager</button></div>`
      : `<p class="buzzline">Who gets the Daily Double?</p><div class="row">${S.players.map(p => `<button class="btn btn-ghost" onclick="emit('host:ddPlayer',{pid:'${p.id}'})">${esc(p.name)}</button>`).join('')}</div>`}`;
  } else if (S.hostMode === 'player') {
    if (c.speak && c.reading) speakClue(c); else if (c.buzzed && isReading()) stopReading();
    const who = c.revealed ? (c.result && c.result.correct ? `<span class="gold">✅ ${esc(name(c.result.pid))} got it!</span>` : c.result && c.result.why === 'timeout' ? "⏰ Time's up!" : 'Nobody got it') :
      c.reading ? '🔊 Reading the clue aloud… buzz any time!' : c.buzzed ? (c.peeked ? `<span class="gold">🛎️ ${esc(name(c.buzzed))}</span> is checking the answer on their phone…` : `<span class="gold">🛎️ ${esc(name(c.buzzed))}</span> — say your answer out loud, then press Reveal`) :
      c.buzzOpen ? 'Buzzers are live!' : 'Nobody left to buzz';
    body = `<div class="meta">${esc(cat)} · ${c.dd ? 'Daily Double' + (c.wager ? ' · ' + money(c.wager) : '') : '$' + c.value}</div>
    <div class="clue ${c.clue && c.clue.q ? '' : 'hiddenclue'}">${c.clue && c.clue.q ? esc(c.clue.q) : '🔊 Listen…'}</div>
    ${c.revealed && c.clue ? `<div class="answer reveal">Correct response: ${esc(c.clue.a)}</div>` : ''}
    <div class="buzzline">${who}</div>
    ${c.locked.length ? `<p class="muted">Wrong / locked out: ${c.locked.map(name).map(esc).join(', ')}</p>` : ''}
    ${c.buzzed && !c.peeked && !c.revealed ? `<div class="row"><button class="btn btn-gold" style="font-size:22px;padding:16px 28px" onclick="emit('host:reveal')">🔒 Reveal answer to ${esc(name(c.buzzed))}</button></div><p class="muted">Sends the answer to their phone only. This screen stays hidden.</p>` : ''}
    <div class="row">${!c.revealed ? `<button class="btn btn-ghost" onclick="repeatClue()">🔁 Repeat clue</button>` : ''}
    ${c.reading ? `<button class="btn btn-ghost" onclick="emit('host:readDone')">Finish reading</button>` : ''}
    <button class="btn ${c.revealed ? 'btn-gold' : 'btn-ghost'}" onclick="emit('host:close')">${c.revealed ? 'Continue →' : 'No one got it · Reveal'}</button></div>`;
  } else {
    const who = c.buzzed ? `<span class="gold">🛎️ ${esc(name(c.buzzed))}</span>${c.dd ? ` wagered ${money(c.wager)}` : ''}` :
      c.buzzOpen ? 'Buzzers are live…' : 'Nobody left to buzz';
    body = `<div class="meta">${esc(cat)} · ${c.dd ? 'Daily Double' : '$' + c.value}</div>
    <div class="clue">${esc(c.clue.q)}</div><div class="answer">Answer: ${esc(c.clue.a)}</div>
    <div class="buzzline">${who}</div>
    ${c.locked.length ? `<p class="muted">Locked out: ${c.locked.map(name).map(esc).join(', ')}</p>` : ''}
    <div class="row">${c.buzzed ? `<button class="btn btn-green" onclick="emit('host:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" onclick="emit('host:judge',{correct:false})">✗ Incorrect</button>` : ''}
    <button class="btn btn-ghost" onclick="emit('host:close')">${c.buzzed ? 'Close' : 'No one got it · Close'}</button></div>`;
  }
  $('overlay').innerHTML = `<div class="overlay">${body}</div>`;
}
function lobby() {
  const sel = S.board && S.board.id;
  $('view').innerHTML = `<div class="main"><div>
    ${hostModeToggle(S.hostMode, 'host:mode')}
    ${voiceCard()}
    <h2 style="margin:0">Choose a difficulty</h2>
    <div class="tabs">${Object.keys(DN).map(d => `<button class="tab ${d === diff ? 'on' : ''}" onclick="diff='${d}';render()">${DN[d]}</button>`).join('')}</div>
    <div class="boards">${BOARDS.filter(b => b.difficulty === diff).map(b => `<button class="card bcard ${b.id === sel ? 'sel' : ''}" onclick="emit('host:selectBoard',{boardId:'${b.id}'})">
      <span class="tag t-${b.difficulty}">${DN[b.difficulty]}</span><h3>${esc(b.name)}</h3><p>${esc(b.tagline)}</p>
      <div class="cats"><b>Round 1:</b> ${b.categories[0].map(esc).join(' · ')}<br><b>Round 2:</b> ${b.categories[1].map(esc).join(' · ')}</div></button>`).join('')}</div></div>
    <div class="side"><div class="card joinbox"><div class="muted">Players join at</div><b>${location.host}/play</b><div class="code">${S.code}</div>
      <div class="chips">${S.players.map(p => `<span class="chip">${esc(p.name)}</span>`).join('') || '<span class="muted">Waiting for players…</span>'}</div>
      <button class="btn btn-gold" style="width:100%;margin-top:18px" ${sel && S.players.length ? '' : 'disabled'} onclick="emit('host:start')">${sel ? 'Start game' : 'Pick a board to start'}</button></div></div></div>`;
}
function finalView() {
  const f = S.final, ps = S.players;
  let inner = `<div class="meta">Final Jeopardy · ${esc(f.category)}</div>`;
  if (f.stage === 'wager') inner += `<div class="clue" style="font-size:32px">Players are making wagers…</div>
    <p class="buzzline">${Object.keys(f.wagers).length} / ${ps.length} wagers in</p><button class="btn btn-gold" onclick="emit('host:finalClue')">Reveal clue & open answers</button>
    <p class="muted" style="margin-top:12px">Players with $0 or less wager $0 automatically.</p>`;
  else if (f.stage === 'answer') inner += `<div class="clue">${esc(f.clue)}</div>${f.answer ? `<div class="answer">Answer: ${esc(f.answer)}</div>` : ''}
    <p class="buzzline">Read the clue aloud. ${Object.keys(f.answers).length} / ${ps.length} answers in</p><button class="btn btn-gold" onclick="emit('host:finalLock')">Lock answers & judge</button>`;
  else {
    inner += `<div class="answer" style="margin:16px 0">Correct response: ${esc(f.answer)}</div><div class="card" style="width:min(720px,100%);text-align:left">
    ${ps.map(p => `<div class="final-row"><div><b>${esc(p.name)}</b> <span class="muted">wagered ${money(f.wagers[p.id] || 0)}</span><br>“${esc(f.answers[p.id] || '(no answer)')}”</div>
      ${f.judged[p.id] === undefined ? `<button class="btn btn-green btn-sm" onclick="emit('host:finalJudge',{pid:'${p.id}',correct:true})">✓</button><button class="btn btn-red btn-sm" onclick="emit('host:finalJudge',{pid:'${p.id}',correct:false})">✗</button>`
        : `<span>${f.judged[p.id] ? '✅' : '❌'}</span><b>${money(p.score)}</b>`}</div>`).join('')}</div>`;
    if (S.phase === 'over') { const w = [...ps].sort((a, b) => b.score - a.score)[0];
      inner += `<div class="dd" style="font-size:56px;margin-top:20px">🏆 ${esc(w ? w.name : '')} wins!</div><button class="btn btn-gold" onclick="emit('host:newGame')">Play another board</button>`; }
  }
  $('view').innerHTML = `<div class="main"><div class="card" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px">${inner}</div><div class="side">${scoreboard()}</div></div>`;
}
