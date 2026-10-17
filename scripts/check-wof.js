// Checks WoF puzzles: fit on a 4x14 board, no duplicates, enough puzzles.
const { loadPuzzles, layout } = require('../wof.js');
const P = loadPuzzles(); let bad = 0; const seen = new Map();
for (const p of P) {
  const k = p.text.replace(/[^A-Z]/g, '');
  if (seen.has(k)) { bad++; console.log('  ✗ duplicate:', p.text); } seen.set(k, 1);
  if (!layout(p.text)) { bad++; console.log('  ✗ does not fit 4x14:', p.text); }
}
const cats = {}; P.forEach(p => cats[p.category] = (cats[p.category] || 0) + 1);
console.log(`Puzzles: ${P.length} across ${Object.keys(cats).length} categories`); console.log(' ', JSON.stringify(cats));
console.log(bad || P.length < 150 ? `FAILED (${bad} problems)` : 'PASS: all puzzles fit, no duplicates'); process.exit(bad || P.length < 150 ? 1 : 0);
