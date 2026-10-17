const socket = io('/pir'); let S = null; let host = JSON.parse(sessionStorage.getItem('bw-pir-host') || 'null');
const $ = id => document.getElementById(id); const emit = (e, d) => socket.emit(e, d || {});
socket.on('connect', () => socket.emit('host:create', host || {}, r => { host = r; sessionStorage.setItem('bw-pir-host', JSON.stringify(r)); }));
socket.on('state', s => { S = s; render(); }); socket.on('errorMsg', toast);
function render() {
  $('barinfo').innerHTML = `<span class="muted">Join at <b>${location.host}/pir/play</b></span><span class="code-chip">${S.code}</span>`;
  $('stage').innerHTML = stageHTML(S); $('msg').textContent = S.message; $('foot').innerHTML = FOOT;
  syncWheel(S); clockTick(S); if (S.game && S.game.drops) animateDrops(S.game.drops);
  const sec = S.hostSecrets && S.hostSecrets.length ? `<div class="card hostsecret"><b>🔒 Host only — prices</b>${S.hostSecrets.map(x => `<div class="score-row"><span class="n">${esc(x.name)}</span><span class="s">${money(x.price)}</span></div>`).join('')}</div>` : '';
  let c = hostModeToggle(S.hostMode, 'host:mode', { player: 'The host can play too: prices stay hidden from every screen until revealed.', dedicated: 'A non-player runs the show: secret prices are listed on this screen only.' }) + sec +
    `<div class="card"><b>Host controls</b><p class="muted" style="font-size:13px;margin:6px 0 12px">${S.hostMode === 'dedicated' ? 'Dedicated host: you can see the prices.' : 'Prices stay hidden from you too, so you can play.'}</p>
    <div style="display:grid;gap:8px"><button class="btn btn-gold" onclick="emit('host:row')">Contestants' Row: new item</button>`;
  if (S.row && S.row.revealed && S.row.winner && S.phase === 'row') c += `<div class="muted">Pricing game for ${esc(pname(S, S.row.winner))}:</div><div class="row">${Object.entries(S.gameNames).map(([k, v]) => `<button class="btn btn-ghost btn-sm" onclick="emit('host:game',{type:'${k}'})">${v}</button>`).join('')}<button class="btn btn-ghost btn-sm" onclick="emit('host:game',{})">🎲 Random</button></div>`;
  if (S.row && S.phase === 'row' && !S.row.revealed && S.row.bids.some(b => b.done)) c += `<button class="btn btn-ghost btn-sm" onclick="emit('host:closeBids')">Close bidding now</button>`;
  if (S.row && S.row.revealed && !S.row.winner) c += `<button class="btn btn-ghost btn-sm" onclick="emit('host:rebid')">Everyone overbid: re-bid</button>`;
  c += `<button class="btn btn-ghost" onclick="emit('host:showdown')">Showcase Showdown (top 3)</button><button class="btn btn-ghost" onclick="emit('host:final')">Final Showcase (top 2)</button>
    <label class="muted" style="font-size:14px">Bidding: <select onchange="emit('host:bidMode',{mode:this.value})" style="width:auto;padding:6px"><option value="secret" ${S.bidMode === 'secret' ? 'selected' : ''}>Secret on phones</option><option value="sequential" ${S.bidMode === 'sequential' ? 'selected' : ''}>Sequential, visible</option></select></label></div>
    <div style="margin-top:14px">${[...S.players].sort((a, b) => b.winnings - a.winnings).map(p => `<div class="score-row ${p.connected ? '' : 'off'}"><span class="n">${esc(p.name)}${p.played ? ' ✓' : ''}</span><span class="row" style="gap:6px"><span class="s">${money(Math.round(p.winnings))}</span><button class="btn btn-ghost btn-sm" onclick="adj('${p.id}')">±</button></span></div>`).join('') || '<p class="muted">Waiting for players…</p>'}</div>
    <p class="muted" style="font-size:12px">✓ = already won on Contestants' Row</p><button class="btn btn-ghost btn-sm" onclick="if(confirm('New game?'))emit('host:newGame')">New game</button></div>`;
  $('side').innerHTML = c;
}
function adj(pid) { const d = prompt(`Adjust ${pname(S, pid)}'s winnings by:`); if (d) emit('host:adjust', { pid, delta: +d }); }
