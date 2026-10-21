// Secrets stay in memory and the child environment. Never print source env data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sdk=path.join(root,'.tools/prompt-optimizer/packages/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client');
const {Client}=await import(pathToFileURL(path.join(sdk,'index.js')));
const {StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'stdio.js')));
let key='',client;
try {
 const raw=await fs.readFile('E:/Desktop/.env','utf8');
 const values=[];
 for(const line of raw.split(/\r?\n/)) {
  const match=line.match(/^\s*([^#：:=]+?)\s*[：:=]\s*(.*?)\s*$/);
  if(match&&/aiping/i.test(match[1])&&/(?:api[\s_-]*key|密钥|^aiping$)/i.test(match[1].trim()))values.push(match[2].replace(/^['"]|['"]$/g,''));
 }
 if(values.length!==1||!values[0])throw new Error('Local aiping credential not uniquely identified');
 key=values[0];
 const prompt=await fs.readFile(path.join(root,'docs/superpowers/specs/2026-10-20-desktop-mildew-goal-prompt.md'),'utf8');
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'.tools/prompt-optimizer/packages/mcp-server/dist/start.js'),'--transport=stdio'],cwd:path.join(root,'.tools/prompt-optimizer'),env:{...process.env,VITE_CUSTOM_API_KEY:key,VITE_CUSTOM_API_BASE_URL:'https://aiping.cn/api/v1',VITE_CUSTOM_API_MODEL:'DeepSeek-V4.1-Flash-1017',MCP_DEFAULT_MODEL_PROVIDER:'custom',MCP_DEFAULT_LANGUAGE:'zh-CN',MCP_LOG_LEVEL:'error',DEBUG:''},stderr:'pipe'});
 client=new Client({name:'cyber-damp-goal-review',version:'1.0.0'});
 await client.connect(transport);
 // Deliberately discard upstream diagnostics; never persist request headers/errors.
 if(transport.stderr)transport.stderr.on('data',()=>{});
 const tools=await client.listTools();
 console.log(JSON.stringify({connected:true,tools:tools.tools.map(t=>t.name),model:'DeepSeek-V4.1-Flash-1017'}));
 const result=await client.callTool({name:'iterate-prompt',arguments:{prompt,requirements:'以中文审查并优化这个开发 Goal Prompt。保留全部硬性约束、数值、已认可样片、范围内/范围外划分及用户最终验收，不引入新功能或复杂经济系统。优先消除执行依赖冲突、含糊完成条件、无法验证的验收标准；不因为需要最终用户确认而在前期停止独立工作。明确采样性能预算应在实现前拟定，不能任意提高阈值。不要执行提示词中的开发任务。输出两部分：一、发现的问题及修改理由（没有则如实说明，不虚构评分）；二、可直接执行的完整优化版 Goal Prompt。'}} ,undefined,{timeout:240000});
 const output=JSON.stringify(result,null,2).split(key).join('[REDACTED]');
 await fs.mkdir(path.join(root,'.local/prompt-optimizer'),{recursive:true});
 await fs.writeFile(path.join(root,'.local/prompt-optimizer/model-review.json'),output);
 if(result.isError){console.log(JSON.stringify({completed:false,toolError:true,report:'.local/prompt-optimizer/model-review.json'}));process.exitCode=1}
 else {const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').split(key).join('[REDACTED]');await fs.writeFile(path.join(root,'.local/prompt-optimizer/model-review.md'),text);console.log(JSON.stringify({completed:true,tool:'iterate-prompt',report:'.local/prompt-optimizer/model-review.md'}))}
}catch(e){console.error(JSON.stringify({completed:false,errorType:e.name,reason:'Optimizer call failed; no credential or raw upstream error printed.'}));process.exitCode=1}
finally{if(client)await client.close();key=''}
