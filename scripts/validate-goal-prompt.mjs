// Calls the upstream input validator, not a substitute for LLM quality evaluation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream=path.join(root,'.tools/prompt-optimizer/packages/mcp-server/src/adapters/parameter-adapter.ts');
const {ParameterValidator}=await import(pathToFileURL(upstream));
const prompt=await fs.readFile(path.join(root,'docs/superpowers/specs/2026-10-20-desktop-mildew-goal-prompt.md'),'utf8');
ParameterValidator.validatePrompt(prompt);
ParameterValidator.validateRequirements('保留用户已认可样片、真实桌面尺寸、零干扰、核心范围、执行依赖、可验证验收与诚实完成条件；消除歧义，不扩展经济养成。');
const report={date:'2026-10-20',tool:'linshenkx/prompt-optimizer',check:'Upstream ParameterValidator.validatePrompt / validateRequirements',characters:prompt.length,inputValidation:'passed',modelOptimization:'Recorded separately in model-review files; not checked by this script',note:'Input validation is not an optimizer quality score or proof of implementation success.'};
await fs.mkdir(path.join(root,'.local/prompt-optimizer'),{recursive:true});
await fs.writeFile(path.join(root,'.local/prompt-optimizer/input-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
