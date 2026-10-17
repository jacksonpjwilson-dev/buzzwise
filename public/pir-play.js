const socket = io('/pir'); const $ = id => document.getElementById(id);
let S = null, pid = localStorage.getItem('bw-pid') || Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bw-pid', pid);
let saved = JSON.parse(localStorage.getItem('bw-pir-join') || 'null'); const qcode = new URLSearchParams(location.search).get('code');
function joinForm(err) {
  $('view').innerHTML = `<h1 style="font-size:36px;margin:10px 0">Come on down!</h1><form id="jf" style="display:grid;gap:12px;margin-top:16px">
  <input id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-size:26px;text-align:center;font-weight:800" value="${esc(qcode || (saved && saved.code) || '')}">
  <input id="name" maxlength="14" placeholder="Your name" value="${esc((saved && saved.name) || '')}"><button class="btn btn-gold">Join game</button><p class="status" style="color:var(--red)">${esc(err || '')}</p></form>`;
  $('jf').onsubmit = e => { e.preventDefault(); join($('code').value, $('name').value); };
}
function join(code, name) { socket.emit('player:join', { code, name, pid }, r => { if (r.error) return joinForm(r.error); saved = { code: r.code, name }; localStorage.setItem('bw-pir-join', JSON.stringify(saved)); }); }
socket.on('connect', () => saved && (!qcode || qcode === saved.code) ? join(saved.code, saved.name) : joinForm());
socket.on('state', s => { S = s; render(); }); socket.on('errorMsg', toast);
const send = (e, d) => socket.emit(e, d || {}, r => r && r.error && toast(r.error));
const numForm = (ev, label, extra = '') => `<form id="nf" data-ev="${ev}" style="display:grid;gap:8px;margin-top:10px"><input id="ni" type="number" inputmode="numeric" min="0" placeholder="${label}" autocomplete="off"><button class="btn btn-gold">Lock it in</button>${extra}</form>`;
function render() {
  const meP = S.players.find(p => p.id === pid); if (!meP) return;
  const ae = document.activeElement; const g = S.game, r = S.row, s = S.showdown, f = S.final;
  const key = JSON.stringify([S.phase, r && [r.item.name, r.turn, r.bids.map(b => b.done), r.revealed], g && [g.type, g.idx, g.over, g.chips], s && [s.turn, s.done], f && [f.done, f.revealed]]);
  if (ae && ae.tagName === 'INPUT' && key === render.key) return; render.key = key;
  $('me').innerHTML = `<b>${esc(meP.name)}</b><span class="code-chip" style="font-size:15px">${money(Math.round(meP.winnings))}</span>`;
  let c = '';
  if (S.phase === 'row' && r) { const mine = r.bids.find(b => b.id === pid);
    if (mine && !mine.done && !r.revealed) c = r.mode === 'sequential' && r.turn !== pid ? `<p class="big" style="font-size:20px">Wait for your turn to bid…</p>` : `<p class="big" style="font-size:22px">Your bid (whole dollars)</p>` + numForm('bid', 'Your bid');
    else if (mine && mine.done && !r.revealed) c = `<p class="big" style="font-size:22px">Bid locked 🔒</p>`;
    else if (!mine) c = `<p class="status">Watch Contestants' Row — you might be called next!</p>`; }
  if (S.phase === 'game' && g && g.player === pid && !g.over) {
    if (g.type === 'higherlower') c = `<p class="big" style="font-size:20px">${esc(g.items[g.idx].name)}: is it higher or lower than $${g.items[g.idx].shown}?</p><div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-green" onclick="send('player:move',{choice:'higher'})">⬆ Higher</button><button class="btn btn-red" onclick="send('player:move',{choice:'lower'})">⬇ Lower</button></div>`;
    if (g.type === 'anynumber') c = `<p class="big" style="font-size:20px">Pick a digit</p><div class="kbd" style="grid-template-columns:repeat(5,1fr)">${'1234567890'.split('').map(d => `<button ${g.picked.includes(d) ? 'disabled' : ''} onclick="send('player:move',{digit:'${d}'})">${d}</button>`).join('')}</div>`;
    if (g.type === 'cliff') c = `<p class="big" style="font-size:20px">Price of: ${esc(g.items[g.idx].name)}</p>` + numForm('move:guess', 'Your guess ($)');
    if (g.type === 'clock') c = g.endsAt ? `<div class="timer" id="clockT"></div><p class="big" style="font-size:20px">${esc(g.items[g.idx].name)}</p>${g.lastGuess !== undefined ? `<p class="big gold">$${g.lastGuess}: ${g.hint}</p>` : ''}` + numForm('move:guess', 'Guess fast!') : `<button class="btn btn-gold" style="width:100%" onclick="send('player:move',{start:true})">Start the clock (30s)</button>`;
    if (g.type === 'plinko') c = g.idx < 4 ? `<p class="big" style="font-size:20px">${esc(g.items[g.idx].name)}</p><div class="wactions" style="grid-template-columns:1fr 1fr">${g.items[g.idx].options.map(o => `<button class="btn btn-gold" onclick="send('player:move',{price:${o}})">$${o}</button>`).join('')}</div>` : `<p class="big">Chips: ${g.chips}</p><button class="btn btn-gold" style="width:100%" ${g.chips ? '' : 'disabled'} onclick="send('player:move',{drop:true})">Drop a chip!</button>`; }
  if (S.phase === 'showdown' && s && s.turn === pid && !s.done) c = `<p class="big" style="font-size:22px">Your spin! ${s.totals[pid] !== undefined ? 'Total ' + s.totals[pid] + '¢' : ''}</p><div class="wactions" style="grid-template-columns:1fr 1fr"><button class="btn btn-gold" onclick="send('player:spin')">Spin</button>${s.spins[pid] ? `<button class="btn btn-ghost" onclick="send('player:stay')">Stay</button>` : ''}</div>`;
  if (S.phase === 'final' && f) { const i = f.players.indexOf(pid); if (i >= 0 && !f.done[i]) c = `<p class="big" style="font-size:22px">Secret bid on the whole showcase</p>` + numForm('finalBid', 'Total bid ($)'); else if (i >= 0) c = `<p class="big">Bid locked 🔒</p>`; }
  $('view').innerHTML = `<div style="transform:scale(.92);transform-origin:top center">${stageHTML(S)}</div><p class="status">${esc(S.message)}</p>${c}${FOOT}`;
  syncWheel(S); clockTick(S); if (g && g.drops) animateDrops(g.drops);
  const nf = $('nf'); if (nf) nf.onsubmit = e => { e.preventDefault(); const v = +$('ni').value; const ev = nf.dataset.ev;
    if (ev === 'bid') send('player:bid', { amount: v }); else if (ev === 'finalBid') send('player:finalBid', { amount: v }); else send('player:move', { guess: v }); $('ni').value = ''; };
}
