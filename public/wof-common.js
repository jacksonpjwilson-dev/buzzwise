// Shared Wheel of Fortune rendering helpers
const WCOLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#00acc1', '#f06292'];
function wofLayout(text) {
  const rows = []; let cur = '';
  for (const w of text.split(' ')) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= 14) cur += ' ' + w; else { rows.push(cur); cur = w; } }
  rows.push(cur); return rows;
}
function boardHTML(board) {
  const rows = board ? wofLayout(board) : [];
  const start = Math.floor((4 - rows.length) / 2); let html = '';
  for (let r = 0; r < 4; r++) {
    const row = rows[r - start] || ''; const pad = Math.floor((14 - row.length) / 2);
    for (let c = 0; c < 14; c++) {
      const ch = row[c - pad]; const edge = (r === 0 || r === 3) && (c === 0 || c === 13);
      if (ch === undefined || ch === ' ') html += `<div class="wt ${edge ? 'edge' : 'empty'}"></div>`;
      else if (ch === '_') html += `<div class="wt live"></div>`;
      else html += `<div class="wt live on ${/[A-Z]/.test(ch) ? '' : 'punct'}">${ch}</div>`;
    }
  }
  return `<div class="wboard">${html}</div>`;
}
function wheelSVG(wheel) {
  const n = wheel.length, seg = 360 / n, R = 200; let s = '';
  wheel.forEach((v, i) => {
    const a0 = (i * seg - seg / 2 - 90) * Math.PI / 180, a1 = (i * seg + seg / 2 - 90) * Math.PI / 180;
    const fill = v === 'BANKRUPT' ? '#111' : v === 'LOSE A TURN' ? '#f5f5f5' : v === 'FREE PLAY' ? '#76ff03' : v === 2500 ? '#c0c0c0' : WCOLORS[i % WCOLORS.length];
    const tc = v === 'BANKRUPT' ? '#fff' : v === 'LOSE A TURN' || v === 2500 || v === 'FREE PLAY' ? '#111' : '#fff';
    s += `<path d="M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z" fill="${fill}" stroke="#ffd54f" stroke-width="1.5"/>`;
    const label = typeof v === 'number' ? '$' + v : v;
    s += `<g transform="rotate(${i * seg})"><text transform="translate(0,${-R * 0.6}) rotate(-90)" fill="${tc}" font-size="${String(label).length > 6 ? 11 : 17}" font-weight="900" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif">${label}</text></g>`;
  });
  return `<svg viewBox="-210 -210 420 420" class="wheel-svg"><g id="wheelRot">${s}<circle r="34" fill="#1a237e" stroke="#ffd54f" stroke-width="5"/><text y="6" text-anchor="middle" fill="#ffd54f" font-weight="900" font-size="15" font-family="Inter,sans-serif">SPIN</text></g></svg>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }
