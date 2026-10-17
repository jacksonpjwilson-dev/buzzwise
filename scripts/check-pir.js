const { loadProducts } = require('../pir.js'); const p = loadProducts(); const seen = new Set(); let bad = 0;
for (const x of p) { const k = x.name.toLowerCase(); if (seen.has(k)) { bad++; console.log('dup', x.name); } seen.add(k); if (!(x.price > 0)) { bad++; console.log('price', x.name); } }
if (p.length < 150) { bad++; console.log('only', p.length); }
console.log(`${p.length} products, ${bad} problems`); process.exit(bad ? 1 : 0);
