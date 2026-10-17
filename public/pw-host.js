// Password host screen: never receives the secret word.
partyHost('/pw', render, '/pw/play');
function teamsCard() { return S.teams.length ? `<div class="card" style="padding:14px">${S.teams.map((t, i) => `<div class="score-row ${S.turn && S.turn.team === i ? 'ctrl' : ''}"><span class="n">${esc(t.name)}</span><span class="s">${t.score}</span></div>`).join('')}</div>` : ''; }
function render() {
  const t = S.turn; let st = '', c = hostModeToggle(S.hostMode, 'host:mode', { player: 'Everyone plays. The word only ever appears on the clue-giver\'s phone, and they tap Correct or Pass.', dedicated: 'A referee runs the show and can tap +Clue / Correct / Pass here. The word is still never shown on this shared screen.' });
  if (S.phase === 'lobby') {
    st = `<h1 style="font-size:44px">Password</h1><p class="lead">Two-person teams. The clue-giver sees a secret word on their phone and gives one-word clues aloud. Each clue lowers the value: 10, 9, 8…</p>
      <div class="card"><b>Players (${S.players.length})</b><p class="muted">${S.players.map(p => esc(p.name)).join(', ') || 'Waiting for players…'}</p>${S.teams.length ? `<b>Teams</b>${S.teams.map(t => `<div class="score-row"><span class="n">${esc(t.name)}</span></div>`).join('')}` : ''}</div>`;
    c += `<div class="card"><b>Setup</b><div style="display:grid;gap:8px;margin-top:8px">
      <label class="muted">Difficulty <select id="df">${['easy', 'medium', 'hard', 'mixed'].map(d => `<option ${S.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="muted">Words per team <input id="wpt" type="number" min="1" max="10" value="${S.wordsPerTeam}" style="width:80px"></label>
      <button class="btn btn-ghost btn-sm" onclick="emit('host:settings',{difficulty:$('df').value,wordsPerTeam:+$('wpt').value})">Save</button>
      <div class="row"><button class="btn btn-ghost btn-sm" onclick="emit('host:makeTeams',{})">Pair in join order</button><button class="btn btn-ghost btn-sm" onclick="emit('host:makeTeams',{shuffle:true})">🔀 Shuffle teams</button></div>
      <button class="btn btn-gold" onclick="emit('host:start')">Start game</button><p class="muted" style="font-size:12px">${S.counts.easy} easy · ${S.counts.medium} medium · ${S.counts.hard} hard words</p></div></div>`;
  } else if (S.phase === 'turn' && t) {
    st = `<div class="muted" style="text-align:center">WORD ${S.turnNo} OF ${S.totalTurns} · ${esc(S.teams[t.team].name)}</div><div class="pw-value">${t.value}</div><p class="big">🗣️ ${esc(pname(t.giver))} gives clues · 🤔 ${esc(pname(t.guesser))} guesses</p><p class="status">Clue ${t.clue} · the word is only on ${esc(pname(t.giver))}'s phone</p>${S.last ? `<p class="status">Last word: <b>${esc(S.last.word)}</b> ${S.last.correct ? `(+${S.last.points})` : '(passed)'}</p>` : ''}`;
    c += `<div class="card"><b>Controls</b><div class="row" style="margin-top:8px">${S.hostMode === 'dedicated' ? `<button class="btn btn-ghost" onclick="emit('host:clue')">+ Clue (−1)</button><button class="btn btn-green" onclick="emit('host:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" onclick="emit('host:judge',{correct:false})">Pass</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="emit('host:skip')">Skip word</button></div></div>`;
  } else if (S.phase === 'lightningReady') {
    st = `<h1 style="text-align:center">⚡ Lightning round</h1><p class="big">${esc(S.teams[t.team].name)}</p><p class="status">${esc(pname(t.giver))} gives clues, ${esc(pname(t.guesser))} guesses. +10 per word in 60 seconds.</p>`;
    c += `<button class="btn btn-gold" style="width:100%;font-size:22px" onclick="emit('host:lightningGo')">▶ Start the clock</button>`;
  } else if (S.phase === 'lightning') {
    st = `<h1 style="text-align:center">⚡ Lightning</h1><div class="pw-value" id="lt"></div><p class="big">${t.got} correct</p><p class="status">${t.history.map(h => h.correct ? '✅' : '⏭️').join(' ')}</p>`;
  } else if (S.phase === 'gameOver') {
    const best = [...S.teams].sort((a, b) => b.score - a.score)[0];
    st = `<h1 style="text-align:center">🏆 ${esc(best ? best.name : '')} win!</h1>${t && t.history ? `<p class="status">Lightning words: ${t.history.map(h => `${h.correct ? '✅' : '⏭️'} ${esc(h.word)}`).join(' · ')}</p>` : ''}`;
    c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:newGame')">New game</button>`;
  }
  $('stage').innerHTML = st + `<p class="wmsg">${esc(S.message)}</p>`;
  $('side').innerHTML = c + teamsCard();
  if (S.phase === 'lightning' && t.endsAt) countdown(t.endsAt, S.now, 'lt');
}
