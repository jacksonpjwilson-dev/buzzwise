// Priorities phone: tap the items in order (1 = most important).
partyPlay('/pri', 'Priorities', render);
let pick = [], pickKey = null;
function tap(i) { if (pick.includes(i)) pick = pick.filter(x => x !== i); else if (pick.length < 5) pick.push(i); render(); }
function orderUI(items, label, ev) {
  return `<p class="status">${label}</p><div class="pri-items">${items.map((x, i) => `<div class="pri-item" style="cursor:pointer" onclick="tap(${i})"><span class="rk" style="${pick.includes(i) ? '' : 'background:#334'}">${pick.includes(i) ? pick.indexOf(i) + 1 : ''}</span>${esc(x)}</div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" onclick="pick=[];render()">Clear</button><button class="btn btn-gold" ${pick.length === 5 ? '' : 'disabled'} onclick="send('${ev}',{order:pick})">Lock in</button></div>`;
}
function render() {
  const r = S.round, v = $('view'), me = myId;
  if (S.phase === 'lobby') return v.innerHTML = `<p class="big">You're in!</p><p class="status">Waiting for the host.</p>`;
  if (S.phase === 'gameOver' || !r) return v.innerHTML = `<p class="big">Game over!</p>${scoreList()}`;
  const k = S.roundNo + S.phase; if (pickKey !== k) { pick = []; pickKey = k; }
  const subj = esc(pname(r.subject));
  if (S.phase === 'ranking') return v.innerHTML = r.subject === me ? orderUI(r.items, 'Rank these from MOST (1) to LEAST (5) important to you. Only you can see this.', 'player:rank') : `<p class="big" style="font-size:22px">${subj} is ranking…</p><p class="status">Get ready to guess their order!</p>`;
  if (S.phase === 'guessing') {
    if (r.subject === me) return v.innerHTML = `<p class="big" style="font-size:22px">Locked in 🔒</p><p class="status">Everyone is guessing your order.</p>`;
    if (r.myGuess || (S.guessMode === 'team' && r.submitted.length)) return v.innerHTML = `<p class="big" style="font-size:22px">Guess locked ✅</p><p class="status">Waiting for the reveal…</p>`;
    return v.innerHTML = orderUI(r.items, `Guess ${subj}'s order (1 = most important)${S.guessMode === 'team' ? '. Team mode: one guess for everyone, so agree first!' : ''}`, 'player:guess');
  }
  if (S.phase === 'reveal') { const mine = r.results && (r.results[me] || (r.subject !== me && r.results.team));
    return v.innerHTML = `<p class="status">${subj}'s order:</p><div class="pri-items">${r.rank.map((i, k) => `<div class="pri-item ${r.myGuess ? (r.myGuess[k] === i ? 'hit' : 'miss') : ''}"><span class="rk">${k + 1}</span>${esc(r.items[i])}</div>`).join('')}</div>${mine ? `<p class="big">+${mine.points}${mine.hits === 5 ? ' 🎯' : ''}</p>` : ''}${scoreList()}`; }
}
