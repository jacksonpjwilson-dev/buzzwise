// Password phone: the clue-giver alone receives the word.
partyPlay('/pw', 'Password', render);
function render() {
  const t = S.turn, v = $('view'); const team = S.myTeam >= 0 ? S.teams[S.myTeam] : null;
  const head = team ? `<p class="status">${esc(team.name)} · <b>${team.score}</b> pts</p>` : '';
  if (S.phase === 'lobby') return v.innerHTML = `${head}<p class="big">You're in!</p><p class="status">Waiting for the host to pair teams and start.</p>`;
  if (S.phase === 'gameOver') return v.innerHTML = `${head}<p class="big">Game over!</p>${scoreList()}`;
  if (!t) return v.innerHTML = head;
  const timer = S.phase === 'lightning' ? '<div class="pw-value" id="lt" style="font-size:44px"></div>' : '';
  if (S.role === 'giver' && S.word) {
    v.innerHTML = `${head}${timer}<p class="status">Your secret word${S.phase === 'turn' ? ` · worth <b class="gold">${t.value}</b>` : ''}:</p><div class="pw-word">${esc(S.word)}</div>
      <p class="status">Give ONE-word clues out loud. Don't say the word!</p>
      ${S.phase === 'turn' ? `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px" onclick="send('player:clue')">Gave another clue (now ${Math.max(1, t.value - 1)})</button>` : ''}
      <div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-green" style="padding:22px" onclick="send('player:judge',{correct:true})">✓ Correct</button><button class="btn btn-red" style="padding:22px" onclick="send('player:judge',{correct:false})">Pass</button></div>`;
  } else if (S.role === 'guesser') v.innerHTML = `${head}${timer}<p class="big">You're guessing!</p><p class="status">Listen to ${esc(pname(t.giver))}'s clues and say your guess out loud. Worth <b class="gold">${t.value}</b>.</p>`;
  else if (S.role === 'giver') v.innerHTML = `${head}<p class="big">⚡ You're giving lightning clues!</p><p class="status">Your first word appears when the host starts the clock.</p>`;
  else v.innerHTML = `${head}${timer}<p class="big" style="font-size:22px">${esc(S.teams[t.team].name)} is playing</p><p class="status">${esc(pname(t.giver))} gives clues, ${esc(pname(t.guesser))} guesses. Shh!</p>${scoreList()}`;
  if (S.phase === 'lightning' && t.endsAt) countdown(t.endsAt, S.now, 'lt');
}
