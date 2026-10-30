// Regenerate editable vector artwork with Node.js. PNGs are provided separately.
const fs = require('node:fs');
const path = require('node:path');
const { artwork, shapes } = require('./mushrooms.cjs');
const output = path.resolve(__dirname, '../svg');
fs.mkdirSync(output, { recursive: true });
for (const shape of shapes) for (const young of [true, false]) {
  const name = `${shape}-${young ? 'bud' : 'mature'}`;
  const body = artwork(shape, young);
  fs.writeFileSync(path.join(output, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${body}</svg>`);
}
console.log(`Generated ${shapes.length * 2} SVGs`);
