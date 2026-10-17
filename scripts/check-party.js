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
// After Dark / Fun: hand-written only. Flag the old generator's "adjective + noun" template cards.
const GEN = /^an? (lukewarm|slightly used|extremely online|middle-aged|self-proclaimed|vintage|sweaty|drunk|organic|certified pre-owned|knock-off|overpriced|unlicensed|unsupervised|heavily discounted|passive-aggressive|artisanal|budget|dramatic|suspiciously damp|rogue|emotionally unavailable|sleep-deprived|haunted|gluten-free|spanked|dirty-talking|naked|sticky|moaning|sexually confused|leather-clad|shirtless|horny|lingerie-wearing|handcuffed|greased-up|thirsty|overly flexible|kinky|pantsless|freaky|topless) (pirate|Santa|yoga instructor|astronaut|accountant|lumberjack|bartender|ghost|gardener|pilot|plumber|vampire|chef|sheriff|mermaid|lifeguard|firefighter|nun|CEO|mailman|gym teacher|wizard|dentist|landlord|cowboy|bagpiper|mall cop|influencer|ventriloquist|stand-up comic|sushi roll|hot dog|mattress|magician|inflatable castle|golden retriever|pool noodle|minivan|lawn gnome|chiropractor|crossword|clown|smoothie|hot tub|life coach|psychic|karaoke machine|tax return|yoga mat|wedding DJ)$/i;
for (const id of ['afterdark', 'fun']) { const k = loadDeck(id), g = k.answers.filter(a => GEN.test(a)); g.length ? fail(`${DECKS[id].name}: ${g.length} template-generated answers, e.g. ${g.slice(0, 3).join('; ')}`) : ok(`${DECKS[id].name}: no template-generated answers`); }
{ const k = loadDeck('afterdark'), p2 = k.prompts.filter(p => p.pick === 2).length;
  (k.prompts.length >= 150 && k.answers.length >= 500) ? ok('After Dark: 150+ prompts / 500+ answers') : fail('After Dark needs 150 prompts / 500 answers');
  (p2 / k.prompts.length >= 0.15 && p2 / k.prompts.length <= 0.25) ? ok(`After Dark: ${p2} pick-2 prompts (${Math.round(100 * p2 / k.prompts.length)}%)`) : fail(`After Dark: pick-2 share ${p2}/${k.prompts.length} should be ~20%`); }
console.log(bad ? `\nParty data: ${bad} problem(s)` : '\nParty data: PASS'); process.exit(bad ? 1 : 0);
