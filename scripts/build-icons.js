// Renders the MyGameShow app icons from the artwork in assets/mgs-icon-source.jpg (v1.13; replaces the old letter-mark tiles).
// One-off tool: `npm i --no-save sharp && node scripts/build-icons.js`. The same icon is used for both themes.
// The source has white corners outside its own rounded square: we crop to that square, mask it with its rounded corners,
// and fill the corners by bleeding the nearby artwork colours (so a square icon has no white corners; iOS/Android round it anyway).
const fs = require('fs'), path = require('path');
const sharp = require(process.env.SHARP_PATH || 'sharp');
const SRC = path.join(__dirname, '..', 'assets', 'mgs-icon-source.jpg');
const OUT = process.env.ICON_OUT || path.join(__dirname, '..', 'public');
const BG = '#003f5b';                       // deep teal of the artwork's background (manifest colours match)
const CROP = { left: 5, top: 4, width: 1010, height: 1010 }, R = 216, INSET = 3; // inner rounded square in the 1024 source (corner radius ≈ 212px, measured)
const rr = (s, r, i = 0) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect x="${i}" y="${i}" width="${s - 2 * i}" height="${s - 2 * i}" rx="${r}" fill="#fff"/></svg>`);
(async () => {
  const S = CROP.width;
  const art = await sharp(SRC).extract(CROP).ensureAlpha().png().toBuffer();
  const rounded = await sharp(art).composite([{ input: rr(S, R, INSET), blend: 'dest-in' }]).png().toBuffer();   // transparent corners
  // bleed edge colours outward into the corners: premultiplied blur (colour*alpha and alpha blurred separately, then divided)
  const { data: px } = await sharp(rounded).raw().toBuffer({ resolveWithObject: true });
  const N = S * S, pre = Buffer.alloc(N * 3), al = Buffer.alloc(N * 3); // alpha kept as 3 identical channels (sharp promotes 1-channel raw to 3 anyway)
  for (let i = 0; i < N; i++) { const a = px[i * 4 + 3] / 255; al.fill(px[i * 4 + 3], i * 3, i * 3 + 3); for (let k = 0; k < 3; k++) pre[i * 3 + k] = Math.round(px[i * 4 + k] * a); }
  const blur = (buf, ch, sg) => sharp(buf, { raw: { width: S, height: S, channels: ch } }).blur(sg).raw().toBuffer();
  const [p1, a1, p2, a2] = await Promise.all([blur(pre, 3, 28), blur(al, 3, 28), blur(pre, 3, 90), blur(al, 3, 90)]);
  const bg = [parseInt(BG.slice(1, 3), 16), parseInt(BG.slice(3, 5), 16), parseInt(BG.slice(5, 7), 16)];
  const sq = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) { const a = px[i * 4 + 3] / 255, b = a1[i * 3] / 255;
    for (let k = 0; k < 3; k++) { const b2 = a2[i * 3] / 255;
      const bled = b > 0.25 ? Math.min(255, p1[i * 3 + k] / b) : b2 > 0.05 ? Math.min(255, p2[i * 3 + k] / b2) : bg[k];
      sq[i * 3 + k] = Math.round(px[i * 4 + k] * a + bled * (1 - a)); } }
  const square = await sharp(sq, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer(); // full-bleed square, no white corners
  const at = (buf, size, flat = true) => { let p = sharp(buf).resize(size, size, { kernel: 'lanczos3' }); if (flat) p = p.flatten({ background: BG }); return p; };
  const w = (p, f, rgb) => p.png(rgb ? { compressionLevel: 9 } : { compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toFile(path.join(OUT, f)); // palette PNG keeps files small; apple-touch stays plain RGB
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  await w(at(square, 180), 'apple-touch-icon.png', true);
  await w(at(square, 192), 'icons/icon-192.png');
  await w(at(square, 512), 'icons/icon-512.png');
  // maskable: artwork scaled to 80% on a full-bleed teal canvas so the TV + mic sit inside the 80% safe circle
  const inner = await sharp(square).resize(410, 410).png().toBuffer();
  await w(sharp({ create: { width: 512, height: 512, channels: 3, background: BG } }).composite([{ input: inner, left: 51, top: 51 }]), 'icons/icon-maskable-512.png');
  // small rounded (transparent-corner) versions: favicon + header logo badge
  await w(at(rounded, 32, false), 'favicon-32.png');
  await w(at(rounded, 96, false), 'icons/logo-96.png');
  const b64 = async (buf, s) => (await sharp(buf).resize(s, s).png().toBuffer()).toString('base64');
  const svg = async (buf, s) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><image width="${s}" height="${s}" href="data:image/png;base64,${await b64(buf, s)}"/></svg>`;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), await svg(rounded, 64));
  fs.writeFileSync(path.join(OUT, 'icons', 'icon.svg'), await svg(square, 256));
  // favicon.ico with embedded PNGs (16, 32, 48)
  const imgs = await Promise.all([16, 32, 48].map(s => sharp(rounded).resize(s, s).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length; imgs.forEach((b, i) => { const s = [16, 32, 48][i], e = 6 + 16 * i;
    head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([head, ...imgs]));
  console.log('icons written');
})();
