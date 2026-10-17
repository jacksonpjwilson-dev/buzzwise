// Verifies structure + no duplicate clues/answers across ALL boards.
const boards = require('../data/questions.json');
const W = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', forty: '40', sixty: '60', eighteen: '18' };
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !['the', 'a', 'an'].includes(w)).map(w => W[w] || w).join(' ');
let errors = 0, total = 0; const clues = new Map(), answers = new Map();
const err = m => { errors++; console.log('  ✗ ' + m); };
for (const b of boards) {
  if (!['easy', 'medium', 'hard', 'expert'].includes(b.difficulty)) err(`${b.id}: bad difficulty`);
  b.rounds.forEach((r, ri) => {
    if (r.length !== 6) err(`${b.id} R${ri + 1}: ${r.length} categories`);
    r.forEach(c => {
      if (b.rounds.flat().filter(x => norm(x.name) === norm(c.name)).length > 1) err(`category "${c.name}" repeated within ${b.id}`);
      if (c.clues.length !== 5) err(`${b.id} ${c.name}: ${c.clues.length} clues`);
      c.clues.forEach(x => add(b, c.name, x.q, x.a));
    });
  });
  if (!b.final || !b.final.clue) err(`${b.id}: no final`); else add(b, 'FINAL', b.final.clue, b.final.answer);
}
function add(b, cat, q, a) {
  total++; const where = `${b.id}/${cat}`;
  if (/\.\.\.|…/.test(a)) err(`unfinished answer at ${where}: ${a}`);
  const qk = norm(q), ak = norm(a);
  if (clues.has(qk)) err(`DUP CLUE "${q}" — ${where} & ${clues.get(qk)}`); else clues.set(qk, where);
  if (answers.has(ak)) err(`DUP ANSWER "${a}" — ${where} & ${answers.get(ak)}`); else answers.set(ak, where);
}
const by = {}; boards.forEach(b => (by[b.difficulty] = by[b.difficulty] || []).push(b.name));
console.log(`Boards: ${boards.length}`); for (const d in by) console.log(`  ${d}: ${by[d].join(', ')}`);
console.log(`Total clues: ${total}`);
console.log(errors ? `FAILED: ${errors} problem(s)` : 'PASS: no duplicate clues or answers across all boards');
process.exit(errors ? 1 : 0);
