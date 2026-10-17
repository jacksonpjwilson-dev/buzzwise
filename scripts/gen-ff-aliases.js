// Generates data/ff-aliases.json: extra aliases per survey answer, from the built-in synonym map
// (data/ff-synonyms.json) plus hand-written extras below. Aliases that would collide with another
// answer on the same board are dropped. Run: npm run gen:ff  (then npm run check:ff)
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '..', 'data', 'ff-aliases.json');
if (fs.existsSync(out)) fs.unlinkSync(out); // generate from the raw surveys
const { loadSurveys, synonymAliases, aliasDist, tokens } = require('../ff.js');
const EXTRA = {
  'Brush Teeth': ['brush my teeth', 'teeth', 'toothbrush'], 'Go to the Bathroom': ['pee', 'use the toilet', 'potty'], 'Check Phone': ['look at phone', 'scroll', 'social media', 'texts'],
  'Make Coffee': ['coffee', 'brew coffee'], 'Credit Card': ['debit card', 'cards', 'visa'], "Driver's License": ['license', 'id', 'drivers license'],
  'Overslept': ['woke up late', 'alarm', 'slept in', 'oversleep'], 'Car Trouble': ['flat tire', 'car broke down', 'dead battery'],
  'Hip Hop': ['hiphop', 'breakdancing'], 'Extra Cheese': ['cheese'], 'Peppers': ['green peppers', 'bell peppers', 'jalapenos'],
  'Take Pictures': ['photos', 'pictures'], 'Refrigerator': ['fridge'], 'Spider-Man': ['spiderman', 'spidey'], 'Iron Man': ['ironman', 'tony stark'],
  'Captain America': ['cap'], 'Hulk': ['incredible hulk'], 'Wonder Woman': ['wonderwoman'], 'Watch TV': ['tv', 'television', 'netflix', 'binge'],
  'Play Games': ['games', 'video games', 'board games'], 'Stay Inside': ['stay home', 'stay indoors'], 'Little Red Riding Hood': ['red riding hood'],
  'Police Officer': ['police', 'cop'], 'Mail Carrier': ['mailman', 'postman'], 'Fourth of July': ['july 4th', '4th of july', 'independence day'],
  "Valentine's Day": ['valentines', 'valentines day'], 'Coffee Shop': ['cafe', 'starbucks'], 'Movies': ['movie theater', 'cinema'],
  'Take a Bath': ['bath', 'bubble bath'], 'Listen to Music': ['music'], 'SpongeBob': ['spongebob squarepants', 'sponge bob'], 'Scooby-Doo': ['scooby', 'scooby doo'],
  'Homer Simpson': ['homer', 'the simpsons'], 'Brussels Sprouts': ['brussel sprouts', 'sprouts'], 'Hair Dryer': ['blow dryer'], 'Lift Weights': ['weights', 'weightlifting'],
  'New York': ['nyc', 'new york city', 'manhattan'], 'Las Vegas': ['vegas'], 'Los Angeles': ['la', 'hollywood'], 'Orlando': ['disney world'], 'San Francisco': ['sf', 'san fran'],
  "Noah's Ark": ['the ark', 'noahs ark'], 'Trick or Treat': ['trick or treating', 'treats'], 'Clean Their Room': ['clean room', 'clean up'],
  'Take Out Trash': ['trash', 'garbage'], 'Make Bed': ['make the bed', 'bed'], 'Mow the Lawn': ['mow', 'cut the grass', 'lawn'],
  'Penn and Teller': ['penn & teller'], 'Heart Attack': ['cardiac arrest'], 'Car Accident': ['car crash', 'wreck'], 'High Heels': ['heels', 'stilettos'],
  'Watch the Ball Drop': ['ball drop', 'times square'], 'Make Resolutions': ['resolutions'], 'Leonardo da Vinci': ['da vinci', 'leonardo'], 'Van Gogh': ['vincent van gogh'],
  'Count Sheep': ['sheep'], 'Drink Warm Milk': ['warm milk', 'milk'], 'Take a Pill': ['sleeping pill', 'melatonin'], 'Look at Phone': ['phone', 'scroll'],
  'Wizard of Oz': ['the wizard', 'oz'], 'Bacon Bits': ['bacon'], 'Baseball Cards': ['cards', 'trading cards'], 'Comic Books': ['comics'],
  'Freddy Krueger': ['freddy'], 'Michael Myers': ['myers'], 'Mint Chocolate Chip': ['mint chip', 'mint'], 'Cookies and Cream': ['oreo', 'cookies n cream'],
  'Research the Company': ['research'], 'Print Resume': ['resume'], 'Get Nervous': ['nervous', 'worry'], 'Use Phone': ['phone', 'texting'], 'Damage Books': ['rip books', 'ruin books'],
  'Lion Tamer': ['tamer'], 'Wash Hair': ['shampoo'], 'Chevrolet': ['chevy'], 'Mercedes': ['mercedes benz', 'benz'], 'Sherlock Holmes': ['sherlock'],
  'Hercule Poirot': ['poirot'], 'Inspector Gadget': ['gadget'], 'Peanut Butter': ['pb'], 'Phone Bill': ['cell phone bill'], 'Car Payment': ['car loan'],
  'Winnie the Pooh': ['pooh', 'pooh bear'], 'Smokey the Bear': ['smokey'], 'Teddy Bear': ['teddy'], 'Run Errands': ['errands', 'shopping'],
  'Thomas Edison': ['edison'], 'Benjamin Franklin': ['ben franklin', 'franklin'], 'Alexander Graham Bell': ['graham bell', 'bell'], 'Wright Brothers': ['wright'],
  'Henry Ford': ['ford'], 'Nikola Tesla': ['tesla'], 'Blue Jay': ['bluejay', 'jay'], 'Jerry Seinfeld': ['seinfeld'], 'Robin Williams': ['robin williams'],
  'Change the Radio': ['radio', 'change the station'], 'Look in Mirror': ['mirror'], 'Pick Nose': ['nose'], 'Blow Out Candles': ['candles', 'make a wish'],
  'Open Presents': ['presents', 'gifts'], 'Go Out to Dinner': ['dinner', 'restaurant'], 'Peanut Butter and Jelly': ['pb and j', 'pbj', 'pb&j'],
  'Salt and Pepper': ['salt & pepper'], 'Michael Jordan': ['jordan', 'mj'], 'LeBron James': ['lebron'], 'Tom Brady': ['brady'], 'Babe Ruth': ['babe', 'ruth'],
  'Eye Patch': ['patch'], 'Peg Leg': ['wooden leg'], 'Wet Diaper': ['dirty diaper', 'diaper', 'poop'], 'Wants Attention': ['attention', 'wants to be held'],
};
const result = {}; let added = 0, dropped = 0;
for (const s of loadSurveys()) {
  const m = {};
  s.answers.forEach((a, i) => {
    const cands = new Set([...(EXTRA[a.text] || [])]);
    for (const al of a.aliases) synonymAliases(al).forEach(x => cands.add(x));
    const own = new Set(a.aliases.map(x => tokens(x).join(' ')));
    const keep = [...cands].filter(c => {
      if (!c || own.has(tokens(c).join(' '))) return false;
      const mine = Math.min(...a.aliases.map(al => aliasDist(c, al)));
      const clash = s.answers.some((b, j) => j !== i && b.aliases.some(al => aliasDist(c, al) <= Math.max(mine, 1)));
      if (clash) dropped++;
      return !clash;
    });
    if (keep.length) { m[a.text] = keep; added += keep.length; }
  });
  result[s.q] = m;
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`Wrote ${out}: ${added} aliases for ${Object.keys(result).length} questions (${dropped} dropped as ambiguous).`);
