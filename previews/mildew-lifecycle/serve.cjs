const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const allowed=new Set(['index.html','preview.js','meta.js','icon.png']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!allowed.has(name)){res.writeHead(404);res.end();return}res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});fs.createReadStream(path.join(root,name)).pipe(res)}).listen(4179,'127.0.0.1',()=>console.log('Mildew preview: http://127.0.0.1:4179'));
