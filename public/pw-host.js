// Password host screen: never receives the secret word until the word is solved (reveal).
partyHost('/pw', render, '/pw/play');
function teamsCard() { return S.teams.length ? `<div class="card" style="padding:14px">${S.teams.map((t, i) => `<div class="score-row ${S.phase !== 'gameOver' && S.turn && S.turn.team === i ? 'ctrl' : ''}"><span class="n">${esc(t.name)}</span><span class="s">${t.score}</span></div>`).join('')}</div>` : ''; }
function render() {
  const t = S.turn; let st = '', c = hostModeToggle(S.hostMode, 'host:mode', { player: 'Everyone plays. The word appears only on the clue-givers\' phones; the active giver taps Gave clue, Correct or Wrong.', dedicated: 'A referee runs the show and can tap Gave clue / Correct / Wrong here. The word is still never shown on this screen until it is solved.' });
  if (S.phase === 'lobby') {
    st = `<h1 style="font-size:44px">Password</h1><p class="lead">Head-to-head! Every team's clue-giver sees the same secret word. Teams take turns giving ONE one-word clue. The first team to guess it wins the points: 10, then 9, 8… for every clue given.</p>
      <div class="card"><b>Players (${S.players.length})</b><p class="muted">${S.players.map(p => esc(p.name)).join(', ') || 'Waiting for players…'}</p>${S.teams.length ? `<b>Teams</b>${S.teams.map(t => `<div class="score-row"><span class="n">${esc(t.name)}</span></div>`).join('')}` : ''}</div>`;
    c += `<div class="card"><b>Setup</b><div style="display:grid;gap:8px;margin-top:8px">
      <label class="muted">Difficulty <select id="df">${['easy', 'medium', 'hard', 'mixed'].map(d => `<option ${S.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="muted">Words per team <input id="wpt" type="number" min="1" max="10" value="${S.wordsPerTeam}" style="width:80px"></label>
      <button class="btn btn-ghost btn-sm" onclick="emit('host:settings',{difficulty:$('df').value,wordsPerTeam:+$('wpt').value})">Save</button>
      <div class="row"><button class="btn btn-ghost btn-sm" onclick="emit('host:makeTeams',{})">Pair in join order</button><button class="btn btn-ghost btn-sm" onclick="emit('host:makeTeams',{shuffle:true})">🔀 Shuffle teams</button></div>
      <button class="btn btn-gold" onclick="emit('host:start')">Start game</button><p class="muted" style="font-size:12px">${S.counts.easy} easy · ${S.counts.medium} medium · ${S.counts.hard} hard words</p></div></div>`;
  } else if ((S.phase === 'turn' || S.phase === 'reveal') && t && S.main) {
    const m = S.main, reveal = S.phase === 'reveal';
    const pills = S.teams.map((tm, i) => `<div class="pw-team ${!reveal && t.team === i ? 'on' : ''} ${reveal && S.last && S.last.team === i ? 'won' : ''}"><b>${esc(tm.name)}</b><span>🗣️ ${esc(pname(m.givers[i]))} · 🤔 ${esc(pname(m.guessers[i]))}</span></div>`).join('');
    st = `<div class="muted" style="text-align:center">WORD ${S.turnNo} OF ${S.totalTurns}</div>
      ${reveal ? `<p class="status" style="margin-top:14px">The word was</p><div class="pw-word pw-reveal">${esc(m.word)}</div><p class="big">${S.last && S.last.correct ? `${esc(S.teams[S.last.team].name)} +${S.last.points}` : 'Nobody scores'}</p>`
        : `<div class="pw-turn">${esc(S.teams[t.team].name)}'s turn</div><div class="pw-value">${t.value}</div>
           <p class="big" style="font-size:24px">${m.given ? `🤔 ${esc(pname(t.guesser))}, guess now!` : `🗣️ ${esc(pname(t.giver))}, give one clue`}</p>`}
      <p class="status">Clues given: <b class="gold">${m.clues}</b> / 10</p><div class="pw-teams">${pills}</div>
      ${!reveal ? `<p class="status">🔒 The word is only on the clue-givers' phones</p>` : ''}`;
    c += `<div class="card"><b>Controls</b><div class="row" style="margin-top:8px">${reveal ? `<button class="btn btn-gold" onclick="emit('host:next')">Next word ▶</button>` : `${S.hostMode === 'dedicated' ? `<button class="btn btn-ghost" ${m.given ? 'disabled' : ''} onclick="emit('host:clue')">Gave clue</button><button class="btn btn-green" onclick="emit('host:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" onclick="emit('host:judge',{correct:false})">✗ Wrong / Pass</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="emit('host:skip')">Skip word</button>`}</div></div>`;
  } else if (S.phase === 'lightningReady') {
    const L = S.lightning || { done: [], round: 1 }, prev = L.done[L.done.length - 1];
    st = `<div class="gr-kicker" style="text-align:center">GET READY · LIGHTNING ROUND ${L.round} OF ${S.teams.length}</div><h1 style="text-align:center">⚡ ${esc(S.teams[t.team].name)}</h1>
      ${prev ? `<p class="status">${esc(S.teams[prev.team].name)} got <b class="gold">${prev.got}</b> words (+${prev.got * 10})</p>` : `<p class="status">Every team gets 60 seconds. Trailing team goes first!</p>`}
      <p class="big" style="font-size:24px">🗣️ ${esc(pname(t.giver))} gives clues · 🤔 ${esc(pname(t.guesser))} guesses</p><p class="status">+10 per word in 60 seconds. Fresh words for every team.</p>`;
    c += `<button class="btn btn-gold" style="width:100%;font-size:22px" onclick="emit('host:lightningGo')">▶ Start ${esc(S.teams[t.team].name)}'s clock</button>`;
  } else if (S.phase === 'lightning') {
    st = `<div class="muted" style="text-align:center">⚡ LIGHTNING · ${esc(S.teams[t.team].name)}</div><div class="pw-value" id="lt"></div><p class="big">${t.got} correct (+${t.got * 10})</p><p class="status">${t.history.map(h => h.correct ? '✅' : '⏭️').join(' ')}</p>`;
  } else if (S.phase === 'gameOver') {
    const ranked = S.teams.map((tm, i) => ({ ...tm, i })).sort((a, b) => b.score - a.score), L = S.lightning;
    st = `<div class="gr-kicker" style="text-align:center">FINAL STANDINGS</div><h1 style="text-align:center">🏆 ${esc(ranked[0] ? ranked[0].name : '')} win!</h1>
      <div class="pw-standings">${ranked.map((tm, k) => { const r = L && L.done.find(x => x.team === tm.i); return `<div class="pw-stand ${k === 0 ? 'first' : ''}" style="animation-delay:${(ranked.length - k) * .35}s"><span class="rk">${k + 1}</span><b>${esc(tm.name)}</b><span class="muted">${r ? `⚡ ${r.got} lightning word${r.got === 1 ? '' : 's'}` : ''}</span><span class="s">${tm.score}</span></div>`; }).join('')}</div>
      ${L ? `<p class="status" style="margin-top:14px">${L.done.map(r => `<b>${esc(S.teams[r.team].name)}:</b> ${r.words.map(h => `${h.correct ? '✅' : '⏭️'} ${esc(h.word)}`).join(' · ') || 'no words'}`).join('<br>')}</p>` : ''}`;
    c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:newGame')">New game</button>`;
  }
  $('stage').innerHTML = st + `<p class="wmsg">${esc(S.message)}</p>`;
  $('side').innerHTML = c + teamsCard();
  if (S.phase === 'lightning' && t.endsAt) countdown(t.endsAt, S.now, 'lt');
}
