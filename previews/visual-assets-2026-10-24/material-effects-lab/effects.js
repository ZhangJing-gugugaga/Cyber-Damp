// Reuse extracted originals, transparent masking and the existing Canvas export pipeline.
// Material changes operate on RGB only. Alpha remains exactly equal to the source.
const ICONS=[['WorkBuddy','12'],['ZCode','13'],['学习通','16'],['CC Switch','05'],['腾讯会议','21'],['Obsidian','07']];
const DESIGNS=[
 {name:'绿苔侵角',family:'霉变',desc:'灰绿与米白，左下角形成连片侵蚀，往上蔓延。',colors:[[94,121,75],[176,193,133],[225,226,185]]},
 {name:'蓝灰包边',family:'霉变',desc:'蓝灰与浅白，沿真实外轮廓形成有缺口的霉边。',colors:[[60,91,112],[137,170,185],[218,230,221]]},
 {name:'赭黄侧蚀',family:'霉变',desc:'赭黄与橄榄色，从右侧向内推进，留下大块原色。',colors:[[112,103,46],[182,161,81],[231,215,153]]},
 {name:'灰紫菌岛',family:'霉变',desc:'灰紫、冷白，两块大小悬殊的菌岛，避开均匀撒点。',colors:[[100,79,119],[163,142,175],[223,213,226]]},
 {name:'深青挂霉',family:'霉变',desc:'深青与薄荷白，从顶部垂下粗短霉须。',colors:[[40,102,94],[97,161,143],[200,226,202]]},
 {name:'粉灰扩散',family:'霉变',desc:'粉灰与暗梅色，中心主菌落向外形成不规则枝缘。',colors:[[123,74,93],[193,151,157],[235,214,204]]},
 {name:'底部浸水',family:'水渍',desc:'一条明确的波浪水线，线下整体变蓝、变湿；蓝色原图走暗沉路线。'},
 {name:'纵向流挂',family:'水渍',desc:'两三条宽水痕向下流挂，带亮边，区别于点状霉菌。'},
 {name:'积水晕圈',family:'水渍',desc:'不对称的大块水晕与双层水圈，靠透明蓝色块面辨认。'},
 {name:'底边烤焦',family:'焦化',desc:'棕黑烧焦面从底部上升，细窄焦糖边区分焦化与黑色原图。'},
 {name:'斜向烟熏',family:'焦化',desc:'斜向烟灰带压暗原色，保留灰白烟迹，黑色图标也能辨认。'},
 {name:'局部灼斑',family:'焦化',desc:'一大一小的深褐灼斑与细裂纹，形成局部烧伤。'}
];
const $=s=>document.querySelector(s),sources=new Map(),renders=new Map();let active=0,family='霉变',revision=0;window.labDownloads=[];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const mix=(a,b,t)=>a+(b-a)*t;
function make(){const c=document.createElement('canvas');c.width=c.height=256;return c}
function ellipse(x,y,cx,cy,rx,ry){return Math.hypot((x-cx)/rx,(y-cy)/ry)}
function rough(x,y){return Math.sin(x*.13+y*.05)*.036+Math.sin(y*.19-x*.07)*.026+Math.cos(x*.31+y*.24)*.012}
async function source(id){if(sources.has(id))return sources.get(id);const im=new Image();im.src=ICON_DATA[id];await im.decode();const c=make(),ctx=c.getContext('2d');ctx.drawImage(im,0,0);const pixels=ctx.getImageData(0,0,256,256),p=pixels.data;let colorful=0,blue=0,minX=256,minY=256,maxX=0,maxY=0;for(let i=0;i<p.length;i+=4){if(p[i+3]<128)continue;const x=(i/4)%256,y=Math.floor(i/4/256);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);const r=p[i],g=p[i+1],b=p[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);if(hi-lo>35){colorful++;if((b>r*1.12&&b>g*.77)||(g>r*1.35&&b>r*1.35))blue++}}
 const alpha=(x,y)=>x<0||y<0||x>=256||y>=256?0:p[(y*256+x)*4+3];const distance=new Float32Array(65536);distance.fill(1000);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=y*256+x;if(alpha(x,y)<128)distance[i]=0;else distance[i]=Math.min(x?distance[i-1]+1:1,y?distance[i-256]+1:1,x&&y?distance[i-257]+1.414:1000)}for(let y=255;y>=0;y--)for(let x=255;x>=0;x--){const i=y*256+x;distance[i]=Math.min(distance[i],x<255?distance[i+1]+1:1,y<255?distance[i+256]+1:1,x<255&&y<255?distance[i+257]+1.414:1000)}
 const value={pixels,distance,blue:colorful>0&&blue/colorful>.42,bounds:[minX,minY,maxX,maxY]};sources.set(id,value);return value}
function material(x,y,edge,s,type,thin){const t=[0,.36,.52,.72][s],w=rough(x*256,y*256),a=Math.atan2(y-.49,x-.49);let f=0;
 if(type===0)f=(x*.68+(1-y)*.85)/(t*1.55)+w; // lower-left wedge
 if(type===1)f=edge/([0,12,22,34][s])+(Math.sin(a*5)*.18)+w*2; // silhouette rim
 if(type===2)f=(1-x)/t+.12*Math.sin(y*15)+w; // right-hand invasion
 if(type===3)f=Math.min(ellipse(x,y,.29,.31,t*.65,t*.56),ellipse(x,y,.76,.78,t*.37,t*.46))+w;
 if(type===4){const stripe=Math.min(Math.abs(x-.25)/.11,Math.abs(x-.63)/.15,Math.abs(x-.86)/.07);f=Math.max(y/(t*1.45),stripe)+w}
 if(type===5)f=ellipse(x,y,.51,.53,t*.61,t*.57)+.12*Math.sin(a*7)+w;
 if(type===6)f=(1-y)/(t*1.24+.025*Math.sin(x*19));
 if(type===7){const stream=Math.min(ellipse(x,y,.24,.43,.09+t*.12,.20+t*.6),ellipse(x,y,.68,.34,.07+t*.10,.17+t*.55));f=stream+.06*Math.sin(y*22+x*9)}
 if(type===8)f=Math.min(ellipse(x,y,.32,.70,t*.86,t*.60),ellipse(x,y,.78,.31,t*.42,t*.46))+w*.45;
 if(type===9)f=(1-y)/(t*1.17)+w*1.5;
 if(type===10)f=Math.abs(y-(.3+x*.53))/(t*.47)+w*.3;
 if(type===11)f=Math.min(ellipse(x,y,.73,.66,t*.65,t*.61),ellipse(x,y,.25,.28,t*.32,t*.38))+w;
 // Thin silhouettes need substantial patches, not clipped decorative dots.
 return {f,inside:f<1,edge:f>.85&&f<1.08};
}
async function render(id,s,type){const key=`${id}-${s}-${type}`;if(renders.has(key))return renders.get(key);const src=await source(id),c=make(),ctx=c.getContext('2d'),out=new ImageData(new Uint8ClampedArray(src.pixels.data),256,256),p=out.data,original=src.pixels.data;let changed=0,opaque=0;const [left,top,right,bottom]=src.bounds;
 if(s)for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const i=(y*256+x)*4;if(p[i+3]<20)continue;opaque++;const nx=(x-left)/(right-left),ny=(y-top)/(bottom-top),m=material(nx,ny,src.distance[y*256+x],s,type,id==='05');let color,opacity=0;if(type<6&&m.f<1.08){const palette=DESIGNS[type].colors;const spots=Math.sin(x*.38+Math.sin(y*.18)*2)*Math.cos(y*.34);color=m.f>.85?palette[2]:spots>.35?palette[0]:palette[1];opacity=m.f>1?.65:.92;}
 if(type>=6&&type<=8&&m.f<1.05){const dark=src.blue,colorLum=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];color=dark?[20+colorLum*.12,30+colorLum*.13,43+colorLum*.15]:[23,100,187];opacity=[0,.55,.66,.76][s];if(m.f>.89){color=dark?[55,69,83]:[54,153,226];opacity=.88}if(type===8&&m.f>.65&&m.f<.73){color=dark?[111,124,135]:[147,211,241];opacity=.75}if(type===7&&Math.sin(x*.11+y*.02)>.94){color=dark?[109,125,139]:[164,225,246];opacity=.85}}
 if(type>=9&&m.f<1.08){const lum=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];color=type===10?[52+lum*.20,49+lum*.15,47+lum*.12]:[40,32,28];opacity=[0,.78,.88,.94][s];if(m.f>.88){color=[158,104,57];opacity=.86}if(type===10&&Math.sin((x-y)*.09)>.75){color=[156,148,130];opacity=.62}if(type===11&&m.f<.85&&Math.abs(Math.sin(x*.09+y*.055+Math.sin(y*.08)))<.1){color=[183,131,70];opacity=.8}}
 if(opacity){for(let k=0;k<3;k++)p[i+k]=mix(p[i+k],color[k],opacity);if(Math.max(...[0,1,2].map(k=>Math.abs(p[i+k]-original[i+k])))>25)changed++}}
 ctx.putImageData(out,0,0);const result={url:c.toDataURL(),coverage:opaque?changed/opaque:0,blue:src.blue};renders.set(key,result);return result}
function sample(url,size,name){const d=document.createElement('div');d.className='sample';const im=new Image();im.src=url;im.width=im.height=size;im.alt=name;const small=document.createElement('small');small.textContent=size+' px';d.append(im,small);return d}
async function build(){window.labReady=false;const r=++revision;$('#grid').replaceChildren();window.labDownloads=[];$('#description').textContent=DESIGNS[active].desc;for(const text of ['', '原生','轻度','中度','重度']){const d=document.createElement('div');d.className='head';d.textContent=text;$('#grid').append(d)}let min=1;for(const [name,id] of ICONS){const src=await source(id);if(r!==revision)return;const label=document.createElement('div');label.className='cell label';label.textContent=name;const small=document.createElement('small');small.textContent=DESIGNS[active].family==='水渍'?(src.blue?'暗沉水渍':'蓝色水渍'):(id==='05'?'保留色条间留白':'');label.append(small);$('#grid').append(label);for(let s=0;s<4;s++){const result=await render(id,s,active);if(r!==revision)return;const d=document.createElement('div');d.className='cell';for(const size of ($('#size').value==='small'?[32,48]:[96,128]))d.append(sample(result.url,size,`${name} ${DESIGNS[active].name} ${s}`));$('#grid').append(d);if(s){window.labDownloads.push({name:`${name}-${DESIGNS[active].name}-${['','轻度','中度','重度'][s]}.png`,url:result.url});if(s===1)min=Math.min(min,result.coverage)}}}$('#status').textContent=`${DESIGNS[active].name} · 6 个图标 / 18 张材质变体 · 轻度明显变色面积最低约 ${Math.round(min*100)}%（非视觉评分）`;window.labReady=true;}
function fail(e){$('#status').textContent='载入失败：'+e.message;console.error(e)}
function styleButtons(){ $('#styles').replaceChildren();DESIGNS.forEach((d,i)=>{if(d.family!==family)return;const b=document.createElement('button');b.textContent=d.name;b.className=i===active?'selected':'';b.onclick=()=>{active=i;styleButtons();build().catch(fail)};$('#styles').append(b)})}
for(const f of ['霉变','水渍','焦化']){const b=document.createElement('button');b.textContent=f;b.className=f===family?'selected':'';b.onclick=()=>{family=f;active=DESIGNS.findIndex(d=>d.family===f);document.querySelectorAll('#families button').forEach(n=>n.classList.toggle('selected',n===b));styleButtons();build().catch(fail)};$('#families').append(b)}
async function board(){for(let type=0;type<DESIGNS.length;type++){const d=document.createElement('div');d.className='board-item';const title=document.createElement('b');title.textContent=DESIGNS[type].name;const row=document.createElement('div');row.className='board-icons';for(const id of ['16','05','21']){const im=new Image();im.src=(await render(id,2,type)).url;im.alt=DESIGNS[type].name;row.append(im)}const small=document.createElement('small');small.textContent=DESIGNS[type].family;d.append(title,row,small);d.tabIndex=0;d.setAttribute('role','button');d.ariaLabel='查看'+DESIGNS[type].name;const open=()=>{family=DESIGNS[type].family;active=type;document.querySelectorAll('#families button').forEach(n=>n.classList.toggle('selected',n.textContent===family));styleButtons();build().catch(fail)};d.onclick=open;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};$('#board').append(d)}window.boardReady=true;}
$('#background').onchange=()=>{for(const el of [$('#grid'),$('#board')])el.className=el.id==='grid'?'grid':'board-grid';for(const el of [$('#grid'),$('#board')])el.classList.add($('#background').value)};$('#size').onchange=()=>build().catch(fail);$('#download').onclick=async()=>{const files=[...window.labDownloads];for(const f of files){const a=document.createElement('a');a.download=f.name;a.href=f.url;a.click();await new Promise(r=>setTimeout(r,180))}$('#status').textContent='已发起 18 张 PNG 下载，浏览器可能要求允许多文件下载。'};styleButtons();build().then(board).catch(fail);
