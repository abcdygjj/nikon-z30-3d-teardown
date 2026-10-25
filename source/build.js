// Build a fully self-contained single-file HTML: three.js + CSS + app.
const fs = require('fs');
const path = require('path');

const appArg = process.argv[2] || 'src/app';
const outFile = process.argv[3] || 'nikon-z30.html';
const tplFile = process.argv[4] || 'src/template.html';

let three = fs.readFileSync('vendor/three.module.min.js', 'utf8');
three = three.replace(/\/\/#\s*sourceMappingURL=.*$/m, '');

// Turn the trailing `export{A as B,...}` into `const THREE={B:A,...}` so the
// library can live inside the same inline module as the app.
const m = three.match(/export\s*\{([^{}]*)\}\s*;?\s*$/);
if (!m) throw new Error('could not find three.js export block');
const entries = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const as = s.match(/^(\S+)\s+as\s+(\S+)$/);
  return as ? `${as[2]}:${as[1]}` : s;
});
three = three.slice(0, m.index) + `return {${entries.join(',')}};`;
// Wrap the library in an IIFE so its minified top-level identifiers cannot
// collide with the app's own module-scope names.
three = `const THREE = (() => {\n${three}\n})();\n`;

const tpl = fs.readFileSync(tplFile, 'utf8');
const css = fs.readFileSync('src/style.css', 'utf8');

let app;
if (fs.existsSync(appArg) && fs.statSync(appArg).isDirectory()) {
  app = fs.readdirSync(appArg).filter(f => f.endsWith('.js')).sort()
    .map(f => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(appArg, f), 'utf8'))
    .join('\n');
} else {
  app = fs.readFileSync(appArg, 'utf8');
}

const out = tpl
  .replace('/*__CSS__*/', () => css)
  .replace('/*__THREE__*/', () => three)
  .replace('/*__APP__*/', () => app);

fs.writeFileSync(outFile, out);
console.log(`built ${outFile}  ${(out.length / 1024).toFixed(1)} KB  (exports: ${entries.length}, app: ${(app.length / 1024).toFixed(1)} KB)`);
