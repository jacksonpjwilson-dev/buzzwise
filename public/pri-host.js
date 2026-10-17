// Priorities shared screen: the subject's order is hidden until the reveal (a dedicated host may peek).
partyHost('/pri', render, '/pri/play');
let revealedKey = null;
function render() {
  const r = S.round; let st = '', c = hostModeToggle(S.hostMode, 'host:mode', { player: 'Everyone plays. Nobody (including this screen) sees the subject\'s order until the reveal.', dedicated: 'A non-player host runs it and sees the subject\'s order here once it is locked in.' });
  if (S.phase === 'lobby') {
    st = `<h1 style="font-size:44px">Priorities</h1><p class="lead">Each round one player secretly ranks 5 things from most to least important. Everyone else guesses the order: ${S.perSpot} points per correct spot, +${S.perfect} for a perfect order.</p><div class="card"><b>Players (${S.players.length})</b><p class="muted">${S.players.map(p => esc(p.name)).join(', ') || 'Waiting…'}</p></div><p class="muted">${S.itemCount} items in the deck.</p>`;
    c += `<div class="card"><b>Setup</b><div style="display:grid;gap:8px;margin-top:8px"><div class="tabs">${['individual', 'team'].map(m => `<button class="tab ${S.guessMode === m ? 'on' : ''}" onclick="emit('host:settings',{guessMode:'${m}'})">${m === 'team' ? '👥 Guess as a team' : '🙋 Guess individually'}</button>`).join('')}</div>
      <label class="muted">Times around the table <input id="cy" type="number" min="1" max="5" value="${S.cycles}" style="width:70px" onchange="emit('host:settings',{cycles:+this.value})"></label>
      <button class="btn btn-gold" onclick="emit('host:start')">Start game</button></div></div>`;
  } else if (r) {
    const subj = esc(pname(r.subject));
    st = `<div class="muted" style="text-align:center">ROUND ${S.roundNo} OF ${S.totalRounds}</div><h2 style="text-align:center">${subj}'s priorities</h2>`;
    if (S.phase === 'ranking') st += `<div class="pri-items">${r.items.map(x => `<div class="pri-item"><span class="rk">?</span>${esc(x)}</div>`).join('')}</div><p class="status">${subj} is ranking these in secret…</p>`;
    if (S.phase === 'guessing') { st += `<div class="pri-items">${r.items.map(x => `<div class="pri-item"><span class="rk">?</span>${esc(x)}</div>`).join('')}</div><p class="status">${S.guessMode === 'team' ? 'Team: agree on one order and send it from any phone.' : `Guesses in: ${r.submitted.map(id => esc(pname(id))).join(', ') || 'none yet'}`}</p>`;
      if (r.rank) c += `<div class="card hostsecret"><b>🔒 Host only — ${subj}'s order</b>${r.rank.map((i, k) => `<div class="score-row"><span class="n">${k + 1}. ${esc(r.items[i])}</span></div>`).join('')}</div>`;
      c += `<button class="btn btn-ghost" style="width:100%" onclick="emit('host:reveal')">Reveal now</button>`; }
    if (S.phase === 'reveal' && r.rank) {
      const key = S.roundNo; const anim = revealedKey !== key; revealedKey = key;
      st += `<div class="pri-items ${anim ? 'pri-reveal' : ''}">${r.rank.map((i, k) => `<div class="pri-item" style="animation-delay:${(4 - k) * 0.7}s"><span class="rk">${k + 1}</span>${esc(r.items[i])}</div>`).join('')}</div>`;
      const res = r.results || {}; st += `<div class="card" style="margin-top:14px">${Object.entries(res).map(([id, x]) => `<div class="score-row"><span class="n">${id === 'team' ? '👥 Team' : esc(pname(id))}: ${x.hits}/5 ${x.hits === 5 ? '🎯 PERFECT' : ''}</span><span class="s">+${x.points}</span></div>`).join('') || '<p class="muted">No guesses</p>'}</div>`;
      c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:next')">Next round →</button>`; }
  }
  if (S.phase === 'gameOver') { st = `<h1 style="text-align:center">🏆 Game over</h1>`; c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:newGame')">New game</button>`; }
  $('stage').innerHTML = st + `<p class="wmsg">${esc(S.message)}</p>`;
  $('side').innerHTML = c + scoreList();
}
