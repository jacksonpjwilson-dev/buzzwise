// Password phone: every team's clue-giver receives the word; guessers only see it after it's solved.
partyPlay('/pw', 'Password', render);
function render() {
  const t = S.turn, v = $('view'); const team = S.myTeam >= 0 ? S.teams[S.myTeam] : null;
  const head = team ? `<p class="status">${esc(team.name)} · <b>${team.score}</b> pts</p>` : '';
  if (S.phase === 'lobby') return v.innerHTML = `${head}<p class="big">You're in!</p><p class="status">Waiting for the host to pair teams and start.</p>`;
  if (S.phase === 'gameOver') return v.innerHTML = `${head}<p class="big">Game over!</p>${scoreList()}`;
  if (!t) return v.innerHTML = head;
  const timer = S.phase === 'lightning' ? '<div class="pw-value" id="lt" style="font-size:44px"></div>' : '';
  if (S.phase === 'reveal') v.innerHTML = `${head}<p class="status">The word was</p><div class="pw-word">${esc(S.word || (S.last && S.last.word) || '')}</div><p class="big">${S.last && S.last.correct ? `${esc(S.teams[S.last.team].name)} +${S.last.points}` : 'Nobody scores'}</p><p class="status">Next word coming up…</p>`;
  else if (S.main && S.phase === 'turn') {
    const m = S.main, other = S.teams[t.team].name;
    if (S.role === 'giver' && S.myTurn) v.innerHTML = `${head}<p class="status">Your secret word · worth <b class="gold">${t.value}</b> · clue ${m.given ? m.clues : m.clues + 1}</p><div class="pw-word">${esc(S.word)}</div>
      <p class="status">${m.given ? `Your team is guessing… did ${esc(pname(t.guesser))} get it?` : 'Your turn: give ONE one-word clue out loud.'}</p>
      <button class="btn btn-ghost" style="width:100%;margin-bottom:8px;padding:18px" ${m.given ? 'disabled' : ''} onclick="send('player:clue')">🗣️ Gave clue</button>
      <div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-green" style="padding:22px" onclick="send('player:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" style="padding:22px" onclick="send('player:judge',{correct:false})">✗ Wrong / Pass</button></div>`;
    else if (S.role === 'giver') v.innerHTML = `${head}<p class="status">Your secret word:</p><div class="pw-word">${esc(S.word)}</div><p class="big" style="font-size:22px">⏳ Waiting: ${esc(other)}'s turn</p><p class="status">Listen to their clue. If they miss, you give the next one (worth ${Math.max(0, t.value - (m.given ? 1 : 0))}).</p>`;
    else if (S.role === 'guesser' && S.myTurn) v.innerHTML = `${head}<p class="big">🤔 You're guessing!</p><p class="status">${m.given ? `Say your guess out loud now! Worth <b class="gold">${t.value}</b>.` : `Wait for ${esc(pname(t.giver))}'s clue. Worth <b class="gold">${t.value}</b>.`}</p>`;
    else if (S.role === 'guesser') v.innerHTML = `${head}<p class="big" style="font-size:22px">⏳ ${esc(other)}'s turn</p><p class="status">You guess when it's your team's turn. Listen to every clue: they help you too!</p>`;
    else v.innerHTML = `${head}<p class="big" style="font-size:22px">${esc(other)}'s turn</p>${scoreList()}`;
  }
  else if (S.role === 'giver' && S.word) {
    v.innerHTML = `${head}${timer}<p class="status">Your secret word:</p><div class="pw-word">${esc(S.word)}</div>
      <p class="status">Give ONE-word clues out loud. Don't say the word!</p>
      <div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-green" style="padding:22px" onclick="send('player:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" style="padding:22px" onclick="send('player:judge',{correct:false})">Pass</button></div>`;
  } else if (S.role === 'guesser') v.innerHTML = `${head}${timer}<p class="big">You're guessing!</p><p class="status">Listen to ${esc(pname(t.giver))}'s clues and say your guess out loud.</p>`;
  else if (S.role === 'giver') v.innerHTML = `${head}<p class="big">⚡ You're giving lightning clues!</p><p class="status">Your first word appears when the host starts the clock.</p>`;
  else v.innerHTML = `${head}${timer}<p class="big" style="font-size:22px">${esc(S.teams[t.team].name)} is playing</p><p class="status">${esc(pname(t.giver))} gives clues, ${esc(pname(t.guesser))} guesses. Shh!</p>${scoreList()}`;
  if (S.phase === 'lightning' && t.endsAt) countdown(t.endsAt, S.now, 'lt');
}
