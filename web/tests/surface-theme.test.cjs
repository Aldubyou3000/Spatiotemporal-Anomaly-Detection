const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname,'../src/app/globals.css'),'utf8');
test('ticket spacing references defined theme tokens',()=>{
  const ticketCss = fs.readFileSync(path.join(__dirname,'../src/components/tickets/Tickets.module.css'),'utf8');
  const defined = new Set([...css.matchAll(/(--space-[\w-]+)\s*:/g)].map(match=>match[1]));
  for (const [,token] of ticketCss.matchAll(/var\((--space-[\w-]+)\)/g)) assert.ok(defined.has(token),`${token} is undefined, so the browser ignores its spacing`);
});
function tokens(theme) {
  const body = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)`))[1];
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,key,value])=>[key,value.trim()]));
}
function contrast(a,b) {
  const luminance = hex => {
    const values = hex.match(/[\da-f]{2}/gi).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return values[0]*.2126+values[1]*.7152+values[2]*.0722;
  };
  const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}
for(const theme of ['light','dark']) test(`${theme} surfaces have distinct levels and readable supporting text`,()=>{
  const values=tokens(theme);
  assert.ok(contrast(values['--bg'],values['--surface'])>=1.15,'canvas and content should be visibly distinct');
  for(const foreground of ['--text','--text-secondary','--text-muted','--text-tertiary','--brand-text']) {
    for(const background of ['--bg','--surface','--surface-alt','--surface-sunken']) assert.ok(contrast(values[foreground],values[background])>=4.5,`${foreground} on ${background}`);
  }
  for(const size of ['xs','sm','md','lg','xl']) assert.equal(values[`--shadow-${size}`],'none');
});

for(const theme of ['light','dark']) test(`${theme} selected surfaces remain visible without decorative borders`,()=>{
  const values=tokens(theme);
  assert.ok(contrast(values['--brand-soft'],values['--surface'])>=1.2,'selected fill must stand out from its panel');
  assert.ok(contrast(values['--on-brand-soft'],values['--brand-soft'])>=4.5,'selected text must remain readable');
});
