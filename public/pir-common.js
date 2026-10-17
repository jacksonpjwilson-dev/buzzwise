const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n === undefined || n === null ? '???' : '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }
const FOOT = '<p class="footnote">Prices are rough estimates of typical US retail prices, for fun only.</p>';
const pname = (S, id) => (S.players.find(p => p.id === id) || {}).name || '?';
function sdWheel(values) { const n = values.length, seg = 360 / n, R = 160; let s = '';
  values.forEach((v, i) => { const a0 = (i * seg - seg / 2 - 90) * Math.PI / 180, a1 = (i * seg + seg / 2 - 90) * Math.PI / 180;
    s += `<path d="M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z" fill="${v === 100 ? '#ff2d75' : v % 15 === 0 ? '#2ec4b6' : i % 2 ? '#ffcc4d' : '#ff9f1c'}" stroke="#120a2e" stroke-width="2"/>`;
    s += `<g transform="rotate(${i * seg})"><text transform="translate(0,${-R * 0.72}) rotate(-90)" font-size="15" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="#120a2e" font-family="Inter,sans-serif">${v === 100 ? '$1' : v + '¢'}</text></g>`; });
  return `<div class="sd-wheel"><div class="pointer"></div><svg viewBox="-170 -170 340 340" style="width:100%"><g id="sdRot" style="transform-origin:0 0">${s}<circle r="26" fill="#120a2e" stroke="#ffcc4d" stroke-width="4"/></g></svg></div>`; }
function plinkoHTML(slots) { let pegs = ''; for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) pegs += `<div class="peg" style="left:${(c + (r % 2 ? .5 : 0)) / 9 * 100 + 4}%;top:${20 + r * 30}px"></div>`;
  return `<div class="plinko" id="plinko">${pegs}<div class="slots">${slots.map(v => `<div>${v ? (v >= 1000 ? '$' + v / 1000 + 'K' : '$' + v) : '$0'}</div>`).join('')}</div></div>`; }
let lastDrops = 0;
function animateDrops(drops) { if (!drops || drops.length <= lastDrops) { lastDrops = drops ? drops.length : 0; return; } const d = drops[drops.length - 1]; lastDrops = drops.length;
  const box = document.getElementById('plinko'); if (!box) return; const chip = document.createElement('div'); chip.className = 'chip'; chip.style.left = '50%'; chip.style.top = '6px'; box.append(chip);
  d.path.forEach((col, i) => setTimeout(() => { chip.style.left = ((col + .5) / 9 * 100) + '%'; chip.style.top = (i === d.path.length - 1 ? 275 : 30 + i * 30) + 'px'; }, 250 * (i + 1))); }
function stageHTML(S) {
  let h = '';
  if (S.phase === 'lobby') h = `<div class="pir-item">Welcome to The Price Is Right!</div><p class="muted">Join on your phone, then the host calls the first four names: Come on down!</p>`;
  if (S.phase === 'row' && S.row) { const r = S.row;
    h = `<div class="muted">CONTESTANTS' ROW · ${r.mode === 'sequential' ? 'bids out loud, in order' : 'secret bids'}</div><div class="pir-item">${esc(r.item.name)}</div>${r.revealed ? `<span class="pir-price">${money(r.item.price)}</span>` : '<span class="pir-hidden">$ ? ? ?</span>'}
    <div class="bidrow">${r.bids.map(b => `<div class="bidcard ${r.winner === b.id ? 'win' : ''}"><b>${esc(pname(S, b.id))}</b><div class="amt">${b.bid !== undefined ? '$' + b.bid : b.done ? '🔒' : r.turn === b.id ? '…' : '—'}</div>${r.winner === b.id ? `<div class="gold">${r.exact ? 'EXACT! +$500' : 'WINNER'}</div>` : ''}</div>`).join('')}</div>`; }
  if (S.phase === 'game' && S.game) { const g = S.game;
    h = `<div class="muted">${esc(pname(S, g.player))} plays</div><div class="pir-item">${esc(g.name)}</div><div>Prize: <b>${esc(g.prize.name)}</b> ${g.over ? `<span class="pir-price" style="font-size:28px">${money(g.prize.price)}</span>` : ''}</div>`;
    if (g.type === 'higherlower') h += `<div class="pg-items">${g.items.map((it, i) => `<div class="pg-item ${it.correct === true ? 'ok' : it.correct === false ? 'no' : i === g.idx && !g.over ? 'cur' : ''}"><b>${esc(it.name)}</b><div style="font-size:26px;font-weight:900">$${it.shown}</div>${it.pick ? `<div>${it.pick.toUpperCase()} · actual ${money(it.price)}</div>` : ''}</div>`).join('')}</div>`;
    if (g.type === 'anynumber') h += `<div class="digits">${g.slots.map(d => `<span>${d ?? ''}</span>`).join('')}</div><p>Picked: ${g.picked.join(' ') || '—'} · Misses ${g.misses}/3</p>`;
    if (g.type === 'cliff') h += `<div class="mountain"><div class="climber" style="left:${Math.min(g.steps, 26) / 26 * 88}%;bottom:${Math.min(g.steps, 26) / 26 * 180}px">${g.steps > 25 ? '🪂' : '🧗'}</div></div><p><b>${g.steps}</b> / 25 steps</p>
      <div class="pg-items">${g.items.map((it, i) => `<div class="pg-item ${i === g.idx && !g.over ? 'cur' : ''}"><b>${esc(it.name)}</b>${it.guess !== undefined ? `<div>Guess $${it.guess} · actual ${money(it.price)} · ${it.steps} steps</div>` : ''}</div>`).join('')}</div>`;
    if (g.type === 'clock') h += `<div class="timer" id="clockT">${g.endsAt ? '' : '30'}</div><div class="pg-items">${g.items.map((it, i) => `<div class="pg-item ${g.solved[i] ? 'ok' : i === g.idx && !g.over ? 'cur' : ''}"><b>${esc(it.name)}</b>${it.price !== undefined ? `<div>${money(it.price)}</div>` : ''}</div>`).join('')}</div>
      ${g.lastGuess !== undefined && !g.over ? `<p class="pir-item" style="font-size:30px">$${g.lastGuess}… <span class="${g.hint === 'RIGHT!' ? 'gold' : ''}">${g.hint}</span></p>` : ''}`;
    if (g.type === 'plinko') h += `<div class="pg-items">${g.items.map((it, i) => `<div class="pg-item ${it.correct === true ? 'ok' : it.correct === false ? 'no' : i === g.idx ? 'cur' : ''}"><b>${esc(it.name)}</b><div>$${it.options[0]} or $${it.options[1]}</div>${it.price !== undefined ? `<div>actual ${money(it.price)}</div>` : ''}</div>`).join('')}</div>
      ${g.idx >= 4 ? plinkoHTML(S.plinko) + `<p>Chips left: <b>${g.chips}</b> · Won so far: <b class="gold">$${g.total.toLocaleString()}</b></p>` : ''}`;
    if (g.message) h += `<p class="wmsg">${esc(g.message)}</p>`; }
  if (S.phase === 'showdown' && S.showdown) { const s = S.showdown;
    h = `<div class="muted">SHOWCASE SHOWDOWN</div>${sdWheel(S.wheel)}<div class="bidrow" style="grid-template-columns:repeat(${s.spinners.length},1fr)">${s.spinners.map(id => `<div class="bidcard ${s.winner === id ? 'win' : ''}" style="${s.turn === id && !s.done ? 'border-color:#ffcc4d' : ''}"><b>${esc(pname(S, id))}</b><div class="amt">${s.totals[id] !== undefined ? (s.totals[id] > 100 ? 'OVER' : s.totals[id] + '¢') : '—'}</div></div>`).join('')}</div>`; }
  if ((S.phase === 'final' || S.phase === 'over') && S.final) { const f = S.final;
    h = `<div class="muted">THE FINAL SHOWCASE</div><div class="pg-items">${f.items.map(it => `<div class="pg-item"><b>${esc(it.name)}</b>${it.price !== undefined ? `<div>${money(it.price)}</div>` : ''}</div>`).join('')}</div>
    <div style="margin:16px 0">${f.revealed ? `<span class="pir-price">${money(f.total)}</span>` : '<span class="pir-hidden">TOTAL $ ? ? ?</span>'}</div>
    <div class="bidrow" style="grid-template-columns:1fr 1fr">${f.players.map((id, i) => `<div class="bidcard ${f.winner === id ? 'win' : ''}"><b>${esc(pname(S, id))}</b><div class="amt">${f.bids ? '$' + f.bids[id].toLocaleString() : f.done[i] ? '🔒' : '—'}</div>${f.winner === id ? `<div class="gold">${f.both ? 'WINS BOTH!' : 'WINNER'}</div>` : ''}</div>`).join('')}</div>`; }
  return `<div class="pir-sign"><div>${h}</div></div>`;
}
function syncWheel(S) { const s = S.showdown, g = document.getElementById('sdRot'); if (!s || !g) return;
  if (s.spin && s.spin.at !== syncWheel.at) { const first = syncWheel.at === undefined && Date.now() - S.now > 0; syncWheel.at = s.spin.at; g.style.transform = `rotate(${syncWheel.rot || 0}deg)`; requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = 'transform 3s cubic-bezier(.15,.6,.2,1)'; g.style.transform = `rotate(${s.rotation}deg)`; syncWheel.rot = s.rotation; })); }
  else g.style.transform = `rotate(${s.rotation}deg)`; }
function clockTick(S) { clearInterval(clockTick.t); const g = S.game; if (!g || g.type !== 'clock' || !g.endsAt || g.over) return; const skew = Date.now() - S.now;
  const f = () => { const e = document.getElementById('clockT'); if (e) e.textContent = Math.max(0, Math.ceil((g.endsAt + skew - Date.now()) / 1000)); }; f(); clockTick.t = setInterval(f, 200); }
