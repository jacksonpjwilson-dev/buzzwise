// Cards Against Everyone phone: your hand (only you get it), submit, and judge when you're the Card Czar.
partyPlay('/cae', 'Cards Against Everyone', render);
let sel = [];
const fillP = (p, cards) => { let i = 0; return esc(p.text).replace(/____/g, () => cards && cards[i] !== undefined ? `<u>${esc(cards[i++])}</u>` : '_____'); };
function toggle(id) { const r = S.round; if (sel.includes(id)) sel = sel.filter(x => x !== id); else { if (sel.length >= r.prompt.pick) sel.shift(); sel.push(id); } render(); }
function submit() { const texts = sel.map(id => { const c = S.hand.find(x => x.id === id); return c && c.blank ? ($('bt' + id) || {}).value || '' : ''; });
  send('player:submit', { ids: sel, texts }, r => { if (r && r.error) toast(r.error); else sel = []; }); }
function render() {
  const r = S.round, v = $('view'), me = myId;
  if (S.phase === 'lobby') return v.innerHTML = `<p class="big">You're in!</p><p class="status">Waiting for the host to start (3+ players).</p>`;
  if (!r) return v.innerHTML = scoreList();
  const prompt = `<div class="cae-prompt" style="font-size:20px">${fillP(r.prompt)}</div>`;
  const isCzar = r.czar === me;
  if (S.phase === 'submit') {
    if (isCzar) return v.innerHTML = `${prompt}<p class="big" style="font-size:22px;margin-top:14px">👑 You're the Card Czar</p><p class="status">${r.submitted} / ${r.needed} played. You'll pick the winner.</p>`;
    if (r.iSubmitted) return v.innerHTML = `${prompt}<p class="big" style="font-size:22px;margin-top:14px">Card played ✅</p><p class="status">${r.submitted} / ${r.needed} in…</p>`;
    sel = sel.filter(id => S.hand.some(c => c.id === id)); const keepId = document.activeElement && document.activeElement.id, keepVal = keepId && keepId.startsWith('bt') ? document.activeElement.value : null;
    v.innerHTML = `${prompt}<p class="status" style="margin-top:10px">Pick ${r.prompt.pick} card${r.prompt.pick > 1 ? 's (in order)' : ''}:</p><div class="cae-hand">${S.hand.map(c => `<button class="cae-card ${c.blank ? 'blank' : ''} ${sel.includes(c.id) ? 'sel' : ''}" onclick="toggle(${c.id})">${sel.includes(c.id) && r.prompt.pick > 1 ? `<b>${sel.indexOf(c.id) + 1}.</b> ` : ''}${esc(c.text)}</button>${c.blank && sel.includes(c.id) ? `<input id="bt${c.id}" maxlength="80" placeholder="Write your card">` : ''}`).join('')}</div>
      <button class="btn btn-gold" style="width:100%;margin-top:12px" ${sel.length === r.prompt.pick ? '' : 'disabled'} onclick="submit()">Play ${sel.length === r.prompt.pick ? '' : `(${sel.length}/${r.prompt.pick})`}</button>`;
    if (keepVal !== null && $(keepId)) { $(keepId).value = keepVal; $(keepId).focus(); }
    return;
  }
  if (S.phase === 'judge') {
    if (isCzar) return v.innerHTML = `${prompt}<p class="status" style="margin-top:10px">👑 Pick your favourite:</p><div class="cae-hand">${r.shown.map(s => `<button class="cae-card" onclick="send('player:pick',{sid:'${s.sid}'})">${fillP(r.prompt, s.cards)}</button>`).join('')}</div>`;
    return v.innerHTML = `${prompt}<p class="status" style="margin-top:14px">${r.czar ? `${esc(pname(r.czar))} is judging…` : 'The host is judging…'}</p>`;
  }
  const won = r.winner === me;
  v.innerHTML = `${prompt}<p class="big" style="margin-top:14px">${won ? '🏆 Your card won!' : `${esc(pname(r.winner))} won the round`}</p>${S.phase === 'gameOver' ? '<p class="big">Game over!</p>' : ''}${scoreList()}`;
}
