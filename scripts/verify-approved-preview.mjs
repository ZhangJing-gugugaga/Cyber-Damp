import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('docs/baselines/2026-10-20-approved-preview.json','utf8').replace(/^\uFEFF/,''));
const errors=[];
for(const entry of manifest.files){
  const file=path.join(manifest.root,entry.path);
  if(!fs.existsSync(file)){errors.push(`Missing ${entry.path}`);continue;}
  const bytes=fs.readFileSync(file);
  if(bytes.length!==entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()!==entry.sha256) errors.push(`Changed ${entry.path}`);
}
console.log(JSON.stringify({pass:errors.length===0,files:manifest.files.length,errors}));
process.exitCode=errors.length?1:0;
