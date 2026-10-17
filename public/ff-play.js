const socket = io('/ff'); const $ = id => document.getElementById(id);
let S = null, pid = localStorage.getItem('bw-pid') || Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bw-pid', pid);
let saved = JSON.parse(localStorage.getItem('bw-ff-join') || 'null'); const qcode = new URLSearchParams(location.search).get('code'); let team = saved ? saved.team : 0;
function joinForm(err) {
  $('view').innerHTML = `<h1 style="font-size:38px;margin:10px 0">Join Feud</h1><form id="jf" style="display:grid;gap:12px;margin-top:16px">
  <input id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-size:26px;text-align:center;font-weight:800" value="${esc(qcode || '')}">
  <input id="name" maxlength="14" placeholder="Your name" value="${esc((saved && saved.name) || '')}">
  <div class="teampick"><button type="button" id="tb0" class="btn btn-red ${team === 0 ? 'on' : ''}" onclick="team=0;this.classList.add('on');tb1.classList.remove('on')">Team 1</button><button type="button" id="tb1" class="btn ${team === 1 ? 'on' : ''}" style="background:#2563eb" onclick="team=1;this.classList.add('on');tb0.classList.remove('on')">Team 2</button></div>
  <button class="btn btn-gold">Join game</button>${!qcode ? BWJ.rejoinHtml(saved) : ''}<p class="status" style="color:var(--red)">${esc(err || '')}</p></form>`;
  if ($('rj')) { $('rj').onclick = () => join(saved.code, saved.name, saved.team); BWJ.verify('ff', 'bw-ff-join', saved, () => { saved = null; const b = $('rj'); if (b) b.remove(); }); }
  $('jf').onsubmit = e => { e.preventDefault(); join($('code').value, $('name').value, team); };
}
function join(code, name, t) { socket.emit('player:join', { code, name, pid, team: t }, r => { if (r.error) { if (BWJ.isStale(r.error) && saved && saved.code === String(code).trim().toUpperCase()) { localStorage.removeItem('bw-ff-join'); saved = null; } joined = false; return joinForm(r.error); } joined = true; saved = { code: r.code, name, team: t }; localStorage.setItem('bw-ff-join', JSON.stringify(saved)); }); }
let joined = false; // auto-rejoin only on a reconnect or when the URL carries this saved game's code
socket.on('connect', () => saved && (joined || (qcode && qcode.toUpperCase() === saved.code)) ? join(saved.code, saved.name, saved.team) : joinForm());
socket.on('state', s => { if (GR(s, false)) return; S = s; render(); }); socket.on('errorMsg', toast);
socket.on('strike', e => { showX(e.count); navigator.vibrate && navigator.vibrate(300); }); socket.on('ding', ding);
socket.on('dup', () => toast('Duplicate answer — try again!'));
function ffBuzz() { navigator.vibrate && navigator.vibrate(60); socket.emit('player:buzz', {}, r => r && r.error && toast(r.error)); }
const send = (e, d, cb) => socket.emit(e, d || {}, cb || (r => r && r.error && toast(r.error)));
function answerForm(ev, label) { return `<form id="af" style="display:grid;gap:8px;margin-top:10px"><input id="ai" placeholder="${label}" autocomplete="off"><button class="btn btn-gold">${ev === 'fm' ? 'Submit' : 'Survey says!'}</button>${ev === 'fm' ? `<button type="button" class="btn btn-ghost" onclick="send('player:fmAnswer',{pass:true})">Pass</button>` : ''}</form>`; }
function render() {
  const meP = S.players.find(p => p.id === pid); if (!meP) return;
  const ae = document.activeElement; const key = JSON.stringify([S.phase, S.round && [S.round.buzzed, S.round.control, S.round.num, S.round.faceoffAnswers.length, S.round.fullyRead], S.fm && [S.fm.stage, S.fm.qIndex, S.fm.dup]]);
  if (ae && ae.tagName === 'INPUT' && key === render.key) { headerAndBoard(meP); return; } render.key = key;
  const r = S.round, T = S.teams; let h = `<div id="hb"></div>`;
  if (S.phase === 'lobby') h += `<p class="big" style="font-size:22px">You're on ${esc(T[meP.team].name)}!</p><div class="teampick"><button class="btn btn-red ${meP.team === 0 ? 'on' : ''}" onclick="send('player:team',{team:0})">${esc(T[0].name)}</button><button class="btn ${meP.team === 1 ? 'on' : ''}" style="background:#2563eb" onclick="send('player:team',{team:1})">${esc(T[1].name)}</button></div><p class="status">Waiting for the host to start.</p>`;
  else if (S.phase === 'faceoff') {
    const inFO = r.faceoff.includes(pid), answered = r.faceoffAnswers.some(x => x.pid === pid), fn = id => esc((S.players.find(p => p.id === id) || {}).name || '—');
    const vs = `<p class="big" style="font-size:24px;text-align:center">Face-off: ${r.faceoff.map(fn).join(' vs ')}</p>`;
    if (r.buzzed === pid) h += `<p class="big" style="font-size:22px">${r.firstBuzz === pid ? 'You buzzed first!' : 'Your chance!'} Say it out loud or type it:</p><div class="timer" id="foT"></div>` + answerForm('g', 'Your answer');
    else if (inFO && !answered && !r.buzzed) h += vs + `<button class="buzzer bz-live" id="ffbuzz" onclick="ffBuzz()">BUZZ</button>`;
    else if (inFO && r.buzzed) h += vs + `<button class="buzzer bz-wait" disabled>🔒</button><p class="status">${fn(r.buzzed)} ${r.firstBuzz === r.buzzed ? 'buzzed first. You may get a chance if they miss.' : 'is answering.'}</p>`;
    else h += vs + `<p class="status">${r.buzzed ? `🔔 ${fn(r.buzzed)} is answering…` : 'Waiting for a buzz…'}</p>`;
  } else if (S.phase === 'playpass') h += meP.team === r.control ? `<p class="big" style="font-size:22px">Your team won the face-off!</p><div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-gold" onclick="send('player:playPass',{choice:'play'})">Play</button><button class="btn btn-ghost" onclick="send('player:playPass',{choice:'pass'})">Pass</button></div>` : `<p class="status">${esc(T[r.control].name)} are deciding: play or pass…</p>`;
  else if (S.phase === 'play') h += meP.team === r.control ? `<p class="big" style="font-size:20px">Your team is playing!</p>` + answerForm('g', 'Type your answer') : `<p class="status">Huddle up — if they strike out, you get one steal!</p>`;
  else if (S.phase === 'steal') h += meP.team !== r.control ? `<p class="big" style="font-size:20px">STEAL! One answer for your team:</p>` + answerForm('g', 'Your steal answer') : `<p class="status">The other team is trying to steal…</p>`;
  else if (S.phase === 'fm') { const f = S.fm, pi = f.players.indexOf(pid), active = (f.stage === 'p1' && pi === 0) || (f.stage === 'p2' && pi === 1);
    if (active) h += `<div class="timer" id="fmT"></div><p class="big" style="font-size:20px">${esc(f.questions[f.qIndex] || '')}</p>${f.dup ? '<p style="color:#ef4444;font-weight:800;text-align:center">Duplicate — try again!</p>' : ''}` + answerForm('fm', 'Your answer');
    else h += `<p class="big" style="font-size:22px">Fast Money: ${f.total} / 200</p><p class="status">${pi === 1 && f.stage !== 'ready2' ? 'No peeking — your turn is next!' : 'Watch the big screen.'}</p>`; }
  else if (S.phase === 'fmDone') h += `<p class="big">${S.fm.total >= 200 ? '🎉 Fast Money WIN!' : 'Fast Money: ' + S.fm.total}</p>`;
  $('view').innerHTML = h + `<div id="scores" class="card" style="margin-top:14px"></div>`;
  if ($('af')) $('af').onsubmit = e => { e.preventDefault(); const t = $('ai').value.trim(); if (!t) return; send(S.phase === 'fm' ? 'player:fmAnswer' : 'player:guess', { text: t }); $('ai').value = ''; };
  headerAndBoard(meP);
  if (S.fm && S.fm.endsAt) countdown(S.fm.endsAt, S.fm.now, 'fmT');
  if (r && r.foEndsAt && $('foT')) countdown(r.foEndsAt, r.now, 'foT');
}
function headerAndBoard(meP) {
  const r = S.round, T = S.teams;
  $('me').innerHTML = `<b>${esc(meP.name)}</b><span class="tag" style="background:${meP.team ? '#2563eb55' : '#dc262655'}">${esc(T[meP.team].name)}</span>`;
  if ($('hb')) $('hb').innerHTML = r && !['fm', 'fmDone'].includes(S.phase) ? `<p style="text-align:center;font-weight:800;margin:4px 0 10px">${r.question ? esc(r.question) : '🔊 Listen to the question…'}</p>${ffBoard(r)}<div class="strikes">${S.phase !== 'faceoff' ? '<span>✕</span>'.repeat(r.strikes) : ''}</div>` : '';
  if ($('hb') && r) $('hb').insertAdjacentHTML('beforeend', `<p class="status">${esc(S.message)}</p>`);
  if ($('scores')) $('scores').innerHTML = [0, 1].map(i => `<div class="score-row ${meP.team === i ? 'ctrl' : ''}"><span class="n">${esc(T[i].name)}</span><span class="s">${T[i].score}</span></div>`).join('') + (r ? `<p class="muted" style="text-align:center;margin:6px 0 0">Round ${r.num}${r.mult > 1 ? ' ×' + r.mult : ''} · pot ${r.pot}</p>` : '');
}
