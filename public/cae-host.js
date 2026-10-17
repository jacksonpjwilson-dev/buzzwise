// Cards Against Everyone host / shared screen. Submissions are anonymous until the judge picks.
partyHost('/cae', render, '/cae/play');
const fillPrompt = (p, cards) => { let i = 0; return esc(p.text).replace(/____/g, () => cards && cards[i] !== undefined ? `<u class="gold">${esc(cards[i++])}</u>` : '_____'); };
function deckPicker() {
  return Object.entries(S.deckInfo).map(([k, d]) => `<label class="score-row" style="cursor:pointer"><span class="n"><input type="checkbox" class="dk" value="${k}" ${S.decks.includes(k) ? 'checked' : ''}> ${esc(d.name)} <span class="muted" style="font-size:12px">${d.rating}${d.main ? '' : ' · pack'}</span></span><span class="muted" style="font-size:12px">${d.prompts}/${d.answers}</span></label>`).join('');
}
function saveDecks() { const decks = [...document.querySelectorAll('.dk')].filter(x => x.checked).map(x => x.value);
  let adult = false; if (decks.includes('afterdark') && !S.adultOk) { adult = confirm('After Dark is 18+: crude and sexual humour. Confirm that EVERYONE playing is 18 or older.'); if (!adult) return; }
  emit('host:settings', { decks, adultConfirmed: adult, target: +$('tg').value, writeIns: $('wi').checked }); }
function render() {
  const r = S.round; let st = '', c = hostModeToggle(S.hostMode, 'host:mode', { player: 'Everyone plays. The Card Czar rotates each round and picks the winner on their phone.', dedicated: 'A host judges every round from this screen; all players submit cards.' });
  if (S.phase === 'lobby') {
    st = `<h1 style="font-size:44px">Cards Against Everyone</h1><p class="lead">Fill in the blank with the funniest card from your hand. Everything here is original. Pick your decks on the right.</p><div class="card"><b>Players (${S.players.length})</b><p class="muted">${S.players.map(p => esc(p.name)).join(', ') || 'Waiting… (3+ needed)'}</p></div>`;
    c += `<div class="card"><b>Decks</b><div style="margin-top:8px">${deckPicker()}</div>
      <label class="muted">Points to win <input id="tg" type="number" min="1" max="20" value="${S.target}" style="width:70px"></label><br>
      <label class="muted"><input type="checkbox" id="wi" ${S.writeIns ? 'checked' : ''}> ✏️ Blank write-in cards</label>
      <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="saveDecks()">Save</button><button class="btn btn-gold" onclick="emit('host:start')">Start game</button></div>${S.decks.includes('afterdark') ? '<p class="muted" style="font-size:12px">🔞 After Dark confirmed 18+</p>' : ''}</div>`;
  } else if (r) {
    st = `<div class="muted" style="text-align:center">ROUND ${S.roundNo} · ${r.czar ? `Card Czar: <b>${esc(pname(r.czar))}</b>` : 'Host judges'}</div><div class="cae-prompt" style="margin-top:10px">${fillPrompt(r.prompt)}${r.prompt.pick > 1 ? `<div class="muted" style="font-size:14px;margin-top:8px">PICK ${r.prompt.pick}</div>` : ''}</div>`;
    if (S.phase === 'submit') { st += `<p class="big" style="margin-top:20px">${r.submitted} / ${r.needed} played</p><p class="status">${S.players.filter(p => p.id !== r.czar).map(p => `${r.submittedIds.includes(p.id) ? '✅' : '⏳'} ${esc(p.name)}`).join(' · ')}</p>`;
      c += `<button class="btn btn-ghost btn-sm" style="width:100%" onclick="emit('host:forceJudge')">Judge now (skip stragglers)</button>`; }
    if (r.shown) st += `<div class="cae-subs">${r.shown.map(s => `<div class="cae-sub ${r.winner && s.pid === r.winner ? 'win' : ''}">${s.cards.map(x => `<div>${esc(x)}</div>`).join('<hr style="border:0;border-top:1px dashed #ccc;margin:0">')}
      ${s.pid ? `<div style="color:#666;font-size:13px">— ${esc(pname(s.pid))}</div>` : ''}${S.phase === 'judge' && S.hostMode === 'dedicated' ? `<button class="btn btn-gold btn-sm" onclick="emit('host:pick',{sid:'${s.sid}'})">Pick</button>` : ''}</div>`).join('')}</div>`;
    if (S.phase === 'result') c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:next')">Next round →</button>`;
    if (S.phase === 'gameOver') c += `<button class="btn btn-gold" style="width:100%" onclick="emit('host:newGame')">New game</button>`;
  }
  $('stage').innerHTML = st + `<p class="wmsg">${esc(S.message)}</p>`;
  $('side').innerHTML = c + scoreList();
}
