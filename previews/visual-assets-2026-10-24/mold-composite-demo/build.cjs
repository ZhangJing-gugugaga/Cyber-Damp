const fs=require('fs'),path=require('path');const p=__dirname,data={};
for(const id of ['12','13','16','05'])data[id]='data:image/png;base64,'+fs.readFileSync(path.join(p,'../native-icon-reference/source-icons',id+'.png')).toString('base64');
fs.writeFileSync(path.join(p,'icon-data.js'),'const ICON_DATA='+JSON.stringify(data)+';');
let h=fs.readFileSync(path.join(p,'v1.html'),'utf8');
h=h.replace(/<script>[\s\S]*?<\/script>/,'<script src="icon-data.js"></script><script src="v2.js"></script>')
.replace('霉斑合成 · 三色对照','霉斑合成 · 六套四色对照').replace('同一套霉斑，三种底色。','六套霉斑，四种原生图标。').replace('下载九张 PNG','下载当前套装 PNG')
.replace('<div class="grid" id="grid">','<div id="styles" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"></div><p id="description"></p><div class="grid" id="grid">')
.replace('</style>','.selected{background:#477c8d;color:white}button:hover{border-color:#477c8d}</style>')
.replace('这是程序合成的风格试验：不调用生图 API。三档共用同一组霉斑形状，逐级增加覆盖；原图不重绘。仅供比较视觉，不改动桌面。','原中度已提升为轻度，原重度提升为中度；新重度增加连续覆盖。CC Switch 沿真实色条轮廓布点，并采用偏暖苔色。六套均保留原图透明轮廓；不调用生图 API，不修改桌面。');
fs.writeFileSync(path.join(p,'index.html'),h);
