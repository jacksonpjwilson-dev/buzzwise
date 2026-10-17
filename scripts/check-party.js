// Data checks for Password / Cards Against Everyone / Priorities: counts, duplicates, blanks.
const { loadWords } = require('../pw'); const { loadItems } = require('../pri'); const { loadDeck, DECKS } = require('../cae');
let bad = 0; const fail = m => { bad++; console.log('  ✗ ' + m); }; const ok = m => console.log('  ✓ ' + m);
const dups = list => { const seen = new Set(), d = []; for (const x of list) { const k = x.toLowerCase(); if (seen.has(k)) d.push(x); seen.add(k); } return d; };
const W = loadWords(), all = [...W.easy, ...W.medium, ...W.hard];
(all.length >= 300 && W.easy.length && W.medium.length && W.hard.length) ? ok(`Password: ${all.length} words (${W.easy.length}/${W.medium.length}/${W.hard.length})`) : fail('Password needs 300+ words in all three levels');
dups(all).length ? fail('Password duplicates: ' + dups(all).join(', ')) : ok('Password: no duplicate words');
const I = loadItems(); I.length >= 500 ? ok(`Priorities: ${I.length} items`) : fail('Priorities needs 500+ items'); dups(I).length ? fail('Priorities duplicates: ' + dups(I)) : ok('Priorities: no duplicates');
for (const [id, d] of Object.entries(DECKS)) { const k = loadDeck(id);
  if (d.main && (k.prompts.length < 120 || k.answers.length < 400)) fail(`${d.name}: needs 120 prompts / 400 answers (has ${k.prompts.length}/${k.answers.length})`); else ok(`${d.name}: ${k.prompts.length} prompts, ${k.answers.length} answers`);
  const dp = dups(k.prompts.map(p => p.text)), da = dups(k.answers); if (dp.length || da.length) fail(`${d.name} duplicates: ${[...dp, ...da].slice(0, 5)}`);
  if (k.prompts.some(p => !/____/.test(p.text) || p.pick > 2)) fail(`${d.name}: every prompt needs 1 or 2 blanks`);
  const p2 = k.prompts.filter(p => p.pick === 2).length; if (d.main && !p2) fail(`${d.name}: needs pick-2 prompts`); }
console.log(bad ? `\nParty data: ${bad} problem(s)` : '\nParty data: PASS'); process.exit(bad ? 1 : 0);
