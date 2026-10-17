const socket = io('/wof'); const $ = id => document.getElementById(id);
let S = null, pid = localStorage.getItem('bw-pid') || Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bw-pid', pid);
let saved = JSON.parse(localStorage.getItem('bw-wof-join') || 'null'); const qcode = new URLSearchParams(location.search).get('code');
let bonusPick = { c: [], v: null }, timerInt;
function joinForm(err) {
  $('view').innerHTML = `<h1 style="font-size:38px;margin:10px 0">Join Wheel</h1><p class="muted">Enter the code on the TV.</p><form id="jf" style="display:grid;gap:12px;margin-top:20px">
  <input id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-size:26px;text-align:center;font-weight:800" value="${esc(qcode || '')}">
  <input id="name" maxlength="14" placeholder="Your name" value="${esc((saved && saved.name) || '')}"><button class="btn btn-gold">Join game</button>${!qcode ? BWJ.rejoinHtml(saved) : ''}<p class="status" style="color:var(--red)">${esc(err || '')}</p></form>`;
  if ($('rj')) { $('rj').onclick = () => join(saved.code, saved.name); BWJ.verify('wof', 'bw-wof-join', saved, () => { saved = null; const b = $('rj'); if (b) b.remove(); }); }
  $('jf').onsubmit = e => { e.preventDefault(); join($('code').value, $('name').value); };
}
function join(code, name) { socket.emit('player:join', { code, name, pid }, r => { if (r.error) { if (BWJ.isStale(r.error) && saved && saved.code === String(code).trim().toUpperCase()) { localStorage.removeItem('bw-wof-join'); saved = null; } joined = false; return joinForm(r.error); } joined = true; saved = { code: r.code, name }; localStorage.setItem('bw-wof-join', JSON.stringify(saved)); }); }
let joined = false; // auto-rejoin only on a reconnect or when the URL carries this saved game's code
socket.on('connect', () => saved && (joined || (qcode && qcode.toUpperCase() === saved.code)) ? join(saved.code, saved.name) : joinForm());
socket.on('state', s => { if (GR(s, false)) return; S = s; render(); }); socket.on('errorMsg', toast);
const send = (e, d) => socket.emit(e, d || {});
function solvePrompt() { const g = prompt('Solve the puzzle:'); if (g) send('player:solve', { guess: g }); }
function render() {
  const meP = S.players.find(p => p.id === pid); if (!meP) return;
  const ae = document.activeElement; const key = JSON.stringify([S.phase, S.awaiting, S.buzzed, S.bonus && S.bonus.picks]); if (ae && ae.tagName === 'INPUT' && key === render.key) return; render.key = key;
  $('me').innerHTML = `<b>${esc(meP.name)}</b><span class="code-chip" style="font-size:15px">${money(meP.total)}</span>`;
  const mine = S.turn === pid && S.phase === 'round' && !S.solved;
  let h = `${S.board ? boardHTML(S.board) + `<div class="wcat" style="font-size:14px">${esc(S.category)}</div>` : ''}<p class="wmsg" style="font-size:17px">${esc(S.message || '')}</p>`;
  if (S.phase === 'lobby') h += `<div class="big">You're in! 🎡</div><p class="status">Waiting for the host to start.</p>`;
  else if (S.phase === 'round' && !S.solved) {
    h += `<p class="status">Round bank: <b class="gold">${money(meP.bank)}</b></p>`;
    if (!mine) h += `<p class="big" style="font-size:20px">${esc((S.players.find(p => p.id === S.turn) || {}).name)}'s turn</p>`;
    else if (S.awaiting === 'spin' || S.awaiting === 'action') h += `<div class="wactions"><button class="btn btn-gold" ${S.canSpin ? '' : 'disabled'} onclick="send('player:spin')">Spin</button>
      <button class="btn btn-ghost" ${meP.bank >= 250 && S.vowelsLeft ? '' : 'disabled'} onclick="send('player:buyVowel')">Vowel $250</button><button class="btn btn-green" onclick="solvePrompt()">Solve</button></div>`;
    else if (S.awaiting === 'spinning') h += `<div class="big">🎡 Spinning…</div>`;
    else if (S.awaiting === 'consonant' || S.awaiting === 'vowel') {
      const vow = S.awaiting === 'vowel', any = S.freePlay;
      h += `<p class="big" style="font-size:20px">${vow ? 'Pick a vowel' : any ? 'Free Play: pick any letter' : `Pick a consonant for $${S.spinValue}`}</p><div class="kbd">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => { const isV = 'AEIOU'.includes(l);
        const ok = !S.used.includes(l) && (any || (vow ? isV : !isV)); return `<button class="${isV ? 'v' : ''}" ${ok ? '' : 'disabled'} onclick="send('player:letter',{letter:'${l}'})">${l}</button>`; }).join('')}</div>`;
    }
  } else if (S.phase === 'tossup' && !S.solved) {
    const out = S.lockedOut.includes(pid);
    if (S.buzzed === pid) h += `<form id="sf" style="display:grid;gap:10px"><input id="g" placeholder="Type your answer" autocomplete="off" autofocus><button class="btn btn-green">Solve</button></form>`;
    else h += `<button class="buzzer ${out ? 'bz-out' : S.buzzed ? 'bz-wait' : 'bz-live'}" ${out || S.buzzed ? 'disabled' : ''} onclick="send('player:buzz')">${out ? 'OUT' : S.buzzed ? 'WAIT' : 'BUZZ'}</button>`;
  } else if (S.phase === 'bonus' && !S.solved) {
    if (S.bonus.player !== pid) h += `<p class="big" style="font-size:20px">Cheer on ${esc((S.players.find(p => p.id === S.bonus.player) || {}).name)}!</p>`;
    else if (!S.bonus.picks) {
      h += `<p class="big" style="font-size:20px">Pick 3 consonants + 1 vowel</p><p class="status">${bonusPick.c.join(' ')} ${bonusPick.v || ''}</p><div class="kbd">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => { const isV = 'AEIOU'.includes(l);
        const sel = bonusPick.c.includes(l) || bonusPick.v === l; const dis = 'RSTLNE'.includes(l); return `<button class="${isV ? 'v' : ''}" style="${sel ? 'outline:3px solid #22c55e' : ''}" ${dis ? 'disabled' : ''} onclick="pick('${l}')">${l}</button>`; }).join('')}</div>
        <button class="btn btn-gold" style="width:100%;margin-top:12px" ${bonusPick.c.length === 3 && bonusPick.v ? '' : 'disabled'} onclick="send('player:bonusPicks',{consonants:bonusPick.c,vowel:bonusPick.v})">Lock letters</button>`;
    } else h += `<div class="timer" id="timer"></div><form id="sf" style="display:grid;gap:10px"><input id="g" placeholder="Type your answer" autocomplete="off"><button class="btn btn-green">Solve</button></form>`;
  } else if (S.solved) h += `<p class="big" style="font-size:22px">${esc(S.answer || '')}</p>`;
  h += `<div class="card" style="margin-top:16px">${[...S.players].sort((a, b) => b.total - a.total).map(p => `<div class="score-row ${p.id === pid ? 'ctrl' : ''}"><span class="n">${esc(p.name)}</span><span class="s">${money(p.total)} <span class="muted" style="font-weight:500">(${money(p.bank)})</span></span></div>`).join('')}</div>`;
  $('view').innerHTML = h;
  if ($('sf')) $('sf').onsubmit = e => { e.preventDefault(); send('player:solve', { guess: $('g').value }); $('g').value = ''; };
  clearInterval(timerInt);
  if (S.bonus && S.bonus.endsAt && !S.solved) { const skew = Date.now() - S.now; const tick = () => { const t = $('timer'); if (t) t.textContent = Math.max(0, Math.ceil((S.bonus.endsAt + skew - Date.now()) / 1000)); }; tick(); timerInt = setInterval(tick, 200); }
}
function pick(l) { if ('AEIOU'.includes(l)) bonusPick.v = bonusPick.v === l ? null : l; else if (bonusPick.c.includes(l)) bonusPick.c = bonusPick.c.filter(x => x !== l); else if (bonusPick.c.length < 3) bonusPick.c.push(l); render.key = null; render(); }
