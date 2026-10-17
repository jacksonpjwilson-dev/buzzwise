// Validates Family Feud surveys: 100+ unique questions, 5-8 answers, points sum 85-100, no alias collisions within a question.
const { loadSurveys, match } = require('../ff.js'); const S = loadSurveys(); let bad = 0; const seen = new Set();
for (const s of S) {
  const k = s.q.toLowerCase().replace(/[^a-z ]/g, ''); if (seen.has(k)) { bad++; console.log('  ✗ duplicate question:', s.q); } seen.add(k);
  const t = s.answers.reduce((a, b) => a + b.points, 0);
  if (s.answers.length < 5 || s.answers.length > 8) { bad++; console.log(`  ✗ ${s.answers.length} answers:`, s.q); }
  if (t < 85 || t > 100) { bad++; console.log(`  ✗ points sum ${t}:`, s.q); }
  s.answers.forEach((a, i) => a.aliases.forEach(al => { const m = match(al, s.answers); if (m !== i) { bad++; console.log(`  ✗ alias "${al}" matches #${m + 1} not #${i + 1} in:`, s.q); } }));
}
console.log(`Surveys: ${S.length}`); console.log(bad || S.length < 100 ? `FAILED (${bad})` : 'PASS: unique questions, 5-8 answers each, aliases resolve correctly');
process.exit(bad || S.length < 100 ? 1 : 0);
