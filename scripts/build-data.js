// Parses data/boards/*.txt into data/questions.json
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'boards');
const boards = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
  const b = { id: f.replace(/^\d+-|\.txt$/g, ''), rounds: [[], []], final: null };
  let round = null, cat = null;
  fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
    line = line.trim(); if (!line) return;
    let m;
    if ((m = line.match(/^(NAME|DIFFICULTY|TAGLINE):\s*(.+)$/))) b[m[1].toLowerCase()] = m[2];
    else if (line === '== R1') round = 0; else if (line === '== R2') round = 1; else if (line === '== FINAL') round = 'F';
    else if (line.startsWith('# ')) { cat = { name: line.slice(2), clues: [] }; if (round === 'F') b.final = { category: cat.name }; else b.rounds[round].push(cat); }
    else if (line.includes(' | ')) {
      const [q, a] = line.split(' | ').map(s => s.trim());
      if (round === 'F') Object.assign(b.final, { clue: q, answer: a }); else cat.clues.push({ q, a });
    } else throw new Error(`${f}:${i + 1} unparsable: ${line}`);
  });
  boards.push(b);
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'questions.json'), JSON.stringify(boards, null, 1));
console.log(`Built ${boards.length} boards`);
