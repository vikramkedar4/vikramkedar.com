// Americana: 500 words in five parts. The pack is data; nothing in the game
// logic knows what is in it. `labels` skins the generic engine terms.
import p1 from './americana.1.js';
import p2 from './americana.2.js';
import p3 from './americana.3.js';
import p4 from './americana.4.js';
import p5 from './americana.5.js';

const entries = [...p1, ...p2, ...p3, ...p4, ...p5];

export default {
  id: 'americana',
  name: 'Americana',
  labels: { mole: 'Arnold', bystander: 'Bystander', handler: 'Handler', agent: 'Agent' },
  entries,                                   // [word, hooks]
  words: entries.map((e) => e[0]),
  hooks: Object.fromEntries(entries.map((e) => [e[0], e[1].split('|')])),
};
