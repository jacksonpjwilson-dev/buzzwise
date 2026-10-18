// Renders the Buzzwise app icons from SVG. One-off tool: `npm i --no-save sharp && node scripts/build-icons.js`
const fs = require('fs'), path = require('path');
const sharp = require(process.env.SHARP_PATH || 'sharp');
const OUT = path.join(__dirname, '..', 'public');
// Font-independent 'B' (paths, evenodd) centred on 256,256 in a 512 box
const B = 'M186 166H272A43 43 0 0 1 272 252H280A47 47 0 0 1 280 346H186Z M222 196H268A13 13 0 0 1 268 222H222Z M222 278H274A19 19 0 0 1 274 316H222Z';
function tile(scale) { // magenta rounded tile with neon glow, scaled around the centre
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="106" y="106" width="300" height="300" rx="72" fill="#ff2fd6" filter="url(#glow)" opacity=".9"/>
    <rect x="106" y="106" width="300" height="300" rx="72" fill="url(#tileg)"/>
    <rect x="114" y="114" width="284" height="284" rx="64" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="4"/>
    <path d="${B}" fill="#fff" fill-rule="evenodd" filter="url(#bglow)"/></g>`;
}
function bulbs() { // marquee bulbs along a rounded square at inset 44
  const pts = [], a = 44, b = 468, r = 70, step = 37;
  for (let x = a + r; x <= b - r + 1; x += step) pts.push([x, a], [x, b]);
  for (let y = a + r; y <= b - r + 1; y += step) pts.push([a, y], [b, y]);
  for (const [cx, cy] of [[a + r, a + r], [b - r, a + r], [a + r, b - r], [b - r, b - r]]) for (const t of [0.35, 0.78, 1.2]) {
    const dx = cx < 256 ? -1 : 1, dy = cy < 256 ? -1 : 1; pts.push([cx + dx * r * Math.sin(t), cy + dy * r * Math.cos(t)]); }
  return pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${i % 2 ? '#ffe14d' : '#fff6c2'}" filter="url(#bulb)"/>`).join('');
}
const defs = `<defs>
  <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#3a0d6b"/><stop offset=".55" stop-color="#16052e"/><stop offset="1" stop-color="#07020f"/></radialGradient>
  <linearGradient id="tileg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5ce0"/><stop offset="1" stop-color="#d4009f"/></linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="bglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feFlood flood-color="#ffd6f7"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="bulb" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="4" result="b"/><feFlood flood-color="#ffb800"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
const svg = (body, bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${bg ? '<rect width="512" height="512" fill="url(#bg)"/>' : ''}${body}</svg>`;
const full = svg(bulbs() + tile(1.08));                 // home-screen icon: full-bleed, bulbs
const maskable = svg(tile(0.92));                       // tile fits inside the 80% safe circle (r=204)
const fav = svg(tile(1.62), false);                     // favicon: just the tile, transparent corners
(async () => {
  fs.writeFileSync(path.join(OUT, 'icons', 'icon.svg'), full);
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), fav);
  const png = (s, size, file, flat) => { let p = sharp(Buffer.from(s), { density: 72 * size / 512 * 2 }).resize(size, size); if (flat) p = p.flatten({ background: '#07020f' }); return p.png().toFile(path.join(OUT, file)); };
  await png(full, 180, 'apple-touch-icon.png', true);
  await png(full, 192, 'icons/icon-192.png', true);
  await png(full, 512, 'icons/icon-512.png', true);
  await png(maskable, 512, 'icons/icon-maskable-512.png', true);
  await png(fav, 32, 'favicon-32.png');
  // favicon.ico with embedded PNGs (16, 32, 48)
  const imgs = await Promise.all([16, 32, 48].map(s => sharp(Buffer.from(fav), { density: 72 }).resize(s, s).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length; imgs.forEach((b, i) => { const s = [16, 32, 48][i], e = 6 + 16 * i;
    head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([head, ...imgs]));
  console.log('icons written');
})();
