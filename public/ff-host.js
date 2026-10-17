const socket = io('/ff'); let S = null; let host = JSON.parse(sessionStorage.getItem('bw-ff-host') || 'null');
const $ = id => document.getElementById(id); const emit = (e, d, cb) => socket.emit(e, d || {}, cb);
socket.on('connect', () => socket.emit('host:create', host || {}, r => { host = r; sessionStorage.setItem('bw-ff-host', JSON.stringify(r)); }));
socket.on('state', s => { if (GR(s, true)) return; S = s; render(); }); socket.on('errorMsg', toast);
socket.on('strike', e => showX(e.count)); socket.on('ding', ding); socket.on('buzz', () => tone(660, .2)); socket.on('dup', () => { tone(300, .15); setTimeout(() => tone(300, .15), 200); });
const nm = id => (S.players.find(p => p.id === id) || {}).name || '?';
function hostSubmit(ev, fm) { ev.preventDefault(); const i = $(fm ? 'fmIn' : 'hIn'); const t = i.value.trim(); if (!t) return; emit(fm ? 'host:fmAnswer' : 'host:guess', { text: t }); i.value = ''; i.focus(); }
let spokenKey = null;
function ffSpeak() { const r = S.round; if (!r) return;
  if (S.speak && r.reading) { const key = r.num + '-' + r.readSeq; if (spokenKey === key) return; spokenKey = key; const seq = r.readSeq;
    const done = () => { if (S.round && S.round.readSeq === seq && S.round.reading) emit('host:readDone', { seq }); };
    if (!('speechSynthesis' in window)) return setTimeout(done, 1500);
    speechSynthesis.cancel(); const u = utter(S.speak); u.onend = done; u.onerror = done; speechSynthesis.speak(u); }
  else if (!r.reading && 'speechSynthesis' in window && speechSynthesis.speaking && spokenKey && r.buzzed) speechSynthesis.cancel(); }
function render() {
  const ae = document.activeElement, keep = ae && ae.tagName === 'INPUT' ? { id: ae.id, v: ae.value } : null;
  $('barinfo').innerHTML = `<span class="muted">Join at <b>${location.host}/ff/play</b></span><span class="code-chip">${S.code}</span>`;
  const r = S.round, T = S.teams;
  const team = i => `<div class="ff-team t${i} ${r && r.control === i && ['play', 'steal', 'playpass'].includes(S.phase) ? 'ctl' : ''}"><div><b>${esc(T[i].name)}</b></div><div class="sc">${T[i].score}</div>
    <div class="muted" style="font-size:13px">${S.players.filter(p => p.team === i).map(p => esc(p.name)).join(', ') || 'no players yet'}</div></div>`;
  let st = `<div class="ff-teams">${team(0)}<div class="ff-pot"><div class="muted" style="font-size:12px">${r ? `ROUND ${r.num}${r.mult > 1 ? ' · ×' + r.mult : ''}` : 'POT'}</div><div class="sc">${r ? r.pot : 0}</div></div>${team(1)}</div>`;
  if (S.phase === 'fm' || S.phase === 'fmDone') st += fmBoard();
  else st += `<div class="ff-q">${r ? (r.question ? esc(r.question) : r.reading ? '🔊 Listen…' : '🔊 Question hidden until it is read in full') : 'Survey says… get ready!'}</div>${ffBoard(r)}<div class="strikes">${r && S.phase !== 'faceoff' ? '<span>✕</span>'.repeat(r.strikes) : ''}</div>`;
  if (S.phase === 'faceoff' && r) { const fn = id => id ? esc(nm(id)) : '—';
    st += `<div class="card" id="foBanner" style="text-align:center;margin:10px 0;padding:14px"><div class="muted" style="font-size:13px;letter-spacing:.15em">FACE-OFF</div>
      <div style="font-size:30px;font-weight:900">${r.faceoff.map(id => `<span style="${r.buzzed === id ? 'color:var(--gold)' : r.buzzed ? 'opacity:.45' : ''}">${fn(id)}</span>`).join(' <span class="muted">vs</span> ')}</div>
      ${r.buzzed ? `<div class="gold" style="font-size:22px;font-weight:800;margin-top:6px">🔔 ${fn(r.buzzed)} ${r.firstBuzz === r.buzzed ? 'buzzed first!' : 'gets a chance!'}</div><div class="timer" id="foT"></div>` : '<div class="muted" style="margin-top:6px">Hands on buzzers…</div>'}</div>`; }
  st += `<p class="wmsg">${esc(S.message)}</p>`;
  $('stage').innerHTML = st;
  // ---- controls (host never sees hidden answers) ----
  let c = hostModeToggle(S.hostMode, 'host:mode', { player: 'The host can play too: answers stay hidden until guessed. Players type guesses on their phones and the game judges them like a host would.', dedicated: 'A non-player runs the show: the full survey board is listed on this screen only.' });
  if (S.hostAnswers) c += `<div class="card hostsecret"><b>🔒 Host only — survey answers</b>${S.hostAnswers.map(a => `<div class="score-row" style="${a.revealed ? 'opacity:.45' : ''}"><span class="n">${a.n}. ${esc(a.text)}</span><span class="s">${a.points}</span></div>`).join('')}</div>`;
  c += `<div class="card"><b>Host controls</b><p class="muted" style="font-size:13px;margin:6px 0 12px">${S.hostMode === 'dedicated' ? 'Dedicated host: you see every answer.' : 'You can play too — answers stay hidden until guessed.'}</p>`;
  if (S.phase === 'lobby') { const grp = list => list.length ? list.map(p => `<div class="score-row"><span class="n">${p.connected === false ? '⚪' : '🟢'} ${esc(p.name)}${p.isHost ? ' (host)' : ''}</span></div>`).join('') : '<p class="muted" style="font-size:13px">nobody yet</p>';
    const un = S.players.filter(p => ![0, 1].includes(p.team));
    c += `<div class="card" id="lobbyPlayers" style="margin:0 0 12px"><b>👥 Players joined (${S.players.length})</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">${[0, 1].map(i => `<div><div class="muted" style="font-size:13px">${esc(T[i].name)}</div>${grp(S.players.filter(p => p.team === i))}</div>`).join('')}</div>${un.length ? `<div class="muted" style="font-size:13px;margin-top:8px">Unassigned</div>${grp(un)}` : ''}</div>`; }
  const hp = S.players.find(p => p.isHost);
  if (S.hostMode !== 'dedicated') c += hp ? `<div class="card" style="margin:0 0 12px"><b>🎮 You're playing</b> as ${esc(hp.name)} on <b>${esc(T[hp.team].name)}</b>${S.phase === 'lobby' ? `<div class="row" style="margin-top:8px">${[0, 1].map(i => `<button class="btn btn-ghost btn-sm" onclick="emit('host:joinTeam',{team:${i}})">Switch to ${esc(T[i].name)}</button>`).join('')}<button class="btn btn-ghost btn-sm" onclick="emit('host:leaveTeam')">Don't play</button></div>` : ''}${r && S.phase === 'faceoff' && r.faceoff.includes(hp.id) ? `<p class="gold">You're in the face-off! ${r.buzzed ? '' : `<button class="btn btn-gold btn-sm" onclick="emit('host:buzzFor',{pid:'${hp.id}'})">🔔 I buzzed</button>`}</p>` : ''}</div>`
    : S.phase === 'lobby' ? `<div class="card" style="margin:0 0 12px"><b>🎮 Play too?</b> Join a team from this screen (or join from your phone at /ff/play).<div class="row" style="margin-top:8px"><input id="hpName" placeholder="Your name" maxlength="14" style="width:150px">${[0, 1].map(i => `<button class="btn btn-gold btn-sm" onclick="emit('host:joinTeam',{team:${i},name:$('hpName').value})">Join ${esc(T[i].name)}</button>`).join('')}</div></div>` : '';
  const canType = ['faceoff', 'play', 'steal'].includes(S.phase) && (S.phase !== 'faceoff' || r.buzzed);
  if (S.phase === 'lobby' || S.phase === 'roundEnd') c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:startRound')">${S.phase === 'lobby' ? 'Start game' : 'Next round'}</button>`;
  if (S.phase === 'lobby') c += voiceCard();
  if (S.phase === 'faceoff' && r && !r.fullyRead && !r.buzzed && !r.reading) c += `<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px" onclick="spokenKey=null;emit('host:reread')">🔁 Read the question again</button>`;
  if (S.phase === 'lobby') c += `<div style="display:grid;gap:8px;margin-top:12px"><input id="t0" placeholder="Team 1 name" value="${esc(T[0].name)}"><input id="t1" placeholder="Team 2 name" value="${esc(T[1].name)}">
    <label class="muted">Max rounds <input id="mr" type="number" min="1" max="10" value="${S.maxRounds}" style="width:90px"></label><button class="btn btn-ghost btn-sm" onclick="emit('host:settings',{teamNames:[$('t0').value,$('t1').value],maxRounds:+$('mr').value})">Save settings</button>
    <p class="muted" style="font-size:13px">First to 300 or after max rounds. Rounds 3 = double, 4+ = triple.</p></div>`;
  if (S.phase === 'faceoff') c += `<p>Face-off: ${r.faceoff.map(id => id ? esc(nm(id)) : '—').join(' vs ')}</p>${r.buzzed ? `<p class="gold">🔔 ${esc(nm(r.buzzed))} is answering</p>` : `<p class="muted">Waiting for a buzz… (or tap who buzzed first)</p><div class="row">${r.faceoff.filter(Boolean).map(id => `<button class="btn btn-ghost btn-sm" onclick="emit('host:buzzFor',{pid:'${id}'})">${esc(nm(id))} buzzed</button>`).join('')}</div>`}`;
  if (S.phase === 'playpass') c += `<p><b>${esc(T[r.control].name)}</b> won the face-off.</p><div class="row"><button class="btn btn-gold" onclick="emit('host:playPass',{choice:'play'})">Play</button><button class="btn btn-ghost" onclick="emit('host:playPass',{choice:'pass'})">Pass</button></div>`;
  if (canType) c += `<form onsubmit="hostSubmit(event)" style="display:grid;gap:8px;margin-top:12px"><input id="hIn" placeholder="Type what ${S.phase === 'steal' ? esc(T[r.stealTeam === undefined ? 1 - r.control : 1 - r.control].name) : 'the player'} said" autocomplete="off"><button class="btn btn-gold">Survey says!</button></form><p class="muted" style="font-size:12px">Players can also type answers on their phones.</p>`;
  if (r && r.canOverride) c += `<button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" onclick="if(confirm('Count the last answer? This reveals the closest matching answer on the board.'))emit('host:override')">Override: this should have counted</button>`;
  if (['faceoff', 'playpass', 'play', 'steal'].includes(S.phase)) c += `<button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" onclick="if(confirm('Skip this round? Answers will be revealed with no points.'))emit('host:skipRound')">Skip round</button>`;
  if (S.phase === 'gameOver' || S.phase === 'roundEnd') c += `<button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="emit('host:fastMoney')">Fast Money →</button>`;
  if (S.phase === 'fm') { const f = S.fm; c += `<p><b>Fast Money</b>: ${esc(nm(f.players[0]))} then ${esc(nm(f.players[1]))}</p>`;
    if (f.stage === 'ready1' || f.stage === 'ready2') c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:fmGo')">Start ${f.stage === 'ready1' ? '20' : '25'}-second clock</button>`;
    else c += `<div class="timer" id="fmT"></div><p class="gold">Q${f.qIndex + 1}: ${esc(f.questions[f.qIndex] || '')}</p><form onsubmit="hostSubmit(event,1)" style="display:grid;gap:8px"><input id="fmIn" placeholder="Type their answer (or they type on phone)" autocomplete="off"><div class="row"><button class="btn btn-gold">Submit</button><button type="button" class="btn btn-ghost" onclick="emit('host:fmAnswer',{pass:true})">Pass</button><button type="button" class="btn btn-ghost" onclick="emit('host:fmStop')">Stop</button></div></form>${f.dup ? '<p style="color:#ef4444;font-weight:800">Duplicate answer — try again!</p>' : ''}`; }
  if (S.phase === 'fmDone' || S.phase === 'gameOver') c += `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:10px" onclick="if(confirm('Start a new game?'))emit('host:newGame')">New game</button>`;
  c += `<div class="row" style="margin-top:14px">${[0, 1].map(i => `<button class="btn btn-ghost btn-sm" onclick="adj(${i})">± ${esc(T[i].name)}</button>`).join('')}</div></div>`;
  $('side').innerHTML = c;
  if (keep) { const e = $(keep.id); if (e) { e.value = keep.v; e.focus(); } }
  ffSpeak();
  if (S.fm && S.fm.endsAt) countdown(S.fm.endsAt, S.fm.now, 'fmT');
  if (r && r.foEndsAt && $('foT')) countdown(r.foEndsAt, r.now, 'foT');
}
function fmBoard() { const f = S.fm; if (!f) return '';
  const cell = e => !e ? '<div class="cell2"></div><div class="pts"></div>' : e.submitted ? '<div class="cell2">✓ answered</div><div class="pts">?</div>' : `<div class="cell2">${esc(e.guess || '—')}${e.answer && e.answer.toLowerCase() !== (e.guess || '').toLowerCase() ? ` <span class="muted" style="font-size:12px">(${esc(e.answer)})</span>` : ''}</div><div class="pts">${e.points}</div>`;
  return `<div class="ff-q">FAST MONEY · ${f.total} / 200</div><div class="ff-board" style="display:block"><div class="ff-fm">${[0, 1].map(pi => `<div style="display:grid;gap:8px"><b style="text-align:center">${esc(nm(f.players[pi]))}</b>${f.rows.map(row => `<div class="row2">${cell(row[pi])}</div>`).join('')}</div>`).join('')}</div></div>`; }
function adj(i) { const d = prompt(`Adjust ${S.teams[i].name}'s score by:`); if (d) emit('host:adjust', { team: i, delta: +d }); }
