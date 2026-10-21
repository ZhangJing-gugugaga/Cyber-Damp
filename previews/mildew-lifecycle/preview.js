/* Standalone procedural motion study. No filesystem bridge or production state. */
const $=id=>document.getElementById(id), clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{v=clamp((v-a)/(b-a));return v*v*(3-2*v)};
const image=new Image();image.src='icon.png';
const surface=document.createElement('canvas');surface.width=surface.height=512;
const c=surface.getContext('2d');
const mold=document.createElement('canvas');mold.width=mold.height=256;
const m=mold.getContext('2d');
const mask=document.createElement('canvas');mask.width=mask.height=256;
const mc=mask.getContext('2d');
let seed=731;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
// Stable colonies: daughter spots appear near established patches, not new noise each frame.
const clusters=[{x:55,y:176,rx:38,ry:25},{x:183,y:184,rx:30,ry:22},{x:110,y:207,rx:30,ry:14}];
const spots=Array.from({length:460},()=>{const a=rand()*Math.PI*2,r=Math.sqrt(rand()),k=clusters[Math.floor(rand()*3)];return{x:k.x+Math.cos(a)*r*k.rx,y:k.y+Math.sin(a)*r*k.ry,r:0.6+rand()*2.6,birth:.20+r*.19+rand()*.12,tone:rand(),phase:rand()*6.28}});
let progress=0,playing=false,mode='full',last=0,clock=0,ready=false;
const dimensions={native:Math.min(128,Math.max(16,window.ICON_META.iconSize)),detail:176};
for(const id of ['native','detail']){const el=$(id),s=dimensions[id]*2;el.style.width=s+'px';el.style.height=s+'px';el.width=Math.round(s*devicePixelRatio);el.height=Math.round(s*devicePixelRatio)}
$('sizeLabel').textContent=dimensions.native+' px · '+(ICON_META.sizeVerified?'Shell 设置值':'参考尺寸');
const states=[['等待潮气','原有图标保持清晰，生长从局部开始。'],['湿润受潮','轻微润色和水光逐渐出现，轮廓与大小保持不变。'],['零星霉点','稳定的小菌落逐渐出现，不使用四角黑边。'],['霉斑扩展','从已有点位向周围连接，仍保留大部分原图。'],['幼芽冒出','根部位于霉斑内，菌柄开始伸长。'],['伸柄展伞','伞盖逐渐展开，菌柄轻轻摇摆，根部不漂移。'],['干燥留痕','湿润高光退去，蘑菇略显干燥；原有霉斑仍在。'],['清洗恢复','演示额外清洗逐步去除霉斑，回到原貌。']];
function stageIndex(p){return p<.07?0:p<.20?1:p<.35?2:p<.49?3:p<.61?4:p<.77?5:p<.87?6:7}
function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill()}
function colony(ctx,s,r){ctx.beginPath();for(let i=0;i<=9;i++){const a=i/9*Math.PI*2,edge=1+.20*Math.sin(a*3+s.phase)+.12*Math.cos(a*5+s.phase);const x=s.x+Math.cos(a)*r*edge,y=s.y+Math.sin(a)*r*edge*.76;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fillStyle=s.tone>.5?'#4e5944':'#798368';ctx.fill()}
function fungus(rootX,rootY,scale,birth,p,time,dry,clean){
 const g=smooth(birth,birth+.20,p);if(g<=0||clean>=1)return;
 const emerge=smooth(0,.2,g),stemH=(3+52*smooth(.04,.85,g))*scale;
 const capOpen=smooth(.25,1,g),w=(3+28*capOpen)*scale,h=(5+13*capOpen)*scale;
 const sway=Math.sin(time*1.5+birth*19)*2.2*scale*g;
 const topX=rootX+sway,topY=rootY-stemH;
 c.save();c.globalAlpha=emerge*(1-clean);ellipse(c,rootX,rootY+1,10*scale,3*scale,'rgba(47,55,31,.23)');
 const stem=c.createLinearGradient(rootX-5*scale,0,rootX+7*scale,0);stem.addColorStop(0,'#b5b59a');stem.addColorStop(.4,'#eee8cf');stem.addColorStop(1,'#c6c9ad');
 c.beginPath();c.moveTo(rootX-4*scale,rootY);c.bezierCurveTo(rootX-6*scale,rootY-stemH*.25,topX-5*scale,topY+8*scale,topX-4*scale,topY);c.lineTo(topX+5*scale,topY);c.bezierCurveTo(topX+3*scale,topY+stemH*.5,rootX+6*scale,rootY-5*scale,rootX+5*scale,rootY);c.closePath();c.fillStyle=stem;c.fill();
 ellipse(c,topX,topY+1,w,h*.31,'#b9af8e');
 c.save();c.beginPath();c.ellipse(topX,topY+1,w*.9,h*.24,0,0,Math.PI);c.clip();c.strokeStyle='rgba(104,93,71,.21)';c.lineWidth=.7;for(let i=-8;i<=8;i++){c.beginPath();c.moveTo(topX,topY-2);c.lineTo(topX+i*w/8,topY+h*.36);c.stroke()}c.restore();
 const grad=c.createLinearGradient(topX-w,topY-h,topX+w*.6,topY+2);grad.addColorStop(0,dry>.5?'#c8b598':'#d4c499');grad.addColorStop(.32,dry>.5?'#b7a083':'#c5ad79');grad.addColorStop(1,dry>.5?'#8f816e':'#8d9363');
 c.beginPath();c.moveTo(topX-w,topY);c.bezierCurveTo(topX-w*.94,topY-h*.48,topX-w*.57,topY-h*1.1,topX,topY-h);c.bezierCurveTo(topX+w*.64,topY-h*.96,topX+w*.91,topY-h*.4,topX+w,topY);c.bezierCurveTo(topX+w*.5,topY+h*.13,topX-w*.55,topY+h*.1,topX-w,topY);c.fillStyle=grad;c.fill();
 c.beginPath();c.moveTo(topX-w*.7,topY-h*.36);c.bezierCurveTo(topX-w*.32,topY-h*.8,topX+w*.1,topY-h*.88,topX+w*.38,topY-h*.61);c.strokeStyle='rgba(255,249,220,'+(.20*(1-dry))+')';c.lineWidth=2*scale;c.stroke();c.restore();
}
function render(p,time=0){
 if(!ready)return;
 const wet=smooth(.04,.20,p)*(1-smooth(.76,.86,p)),dry=smooth(.76,.86,p),clean=smooth(.88,1,p);
 c.clearRect(0,0,512,512);c.save();c.translate(128,164);c.drawImage(image,0,0,256,256);
 m.clearRect(0,0,256,256);m.globalCompositeOperation='source-over';
 // Moisture is localized to the material, never a black frame around its bounds.
 const wash=m.createRadialGradient(70,168,0,70,168,105);wash.addColorStop(0,'rgba(59,95,61,'+(.14*wet)+')');wash.addColorStop(1,'rgba(59,95,61,0)');m.fillStyle=wash;m.fillRect(0,0,256,256);
 for(const s of spots){const grow=smooth(s.birth,s.birth+.12,p)*(1-clean);if(grow<=0)continue;const r=s.r*(.25+grow*.85);m.globalAlpha=grow*(.34+s.tone*.32);colony(m,s,r);
 if(p>.36){m.globalAlpha=smooth(.36,.55,p)*.10*(1-clean);ellipse(m,s.x+.4,s.y-.3,r*2.1,r*1.8,'#9da98a')}
 if(p>.45&&s.tone>.83){m.globalAlpha=.24*smooth(.45,.58,p)*(1-clean);m.strokeStyle='#c1c7a5';m.lineWidth=.6;m.beginPath();m.moveTo(s.x,s.y);m.quadraticCurveTo(s.x-1,s.y-2,s.x+Math.sin(s.phase)*3,s.y-3);m.stroke()}}
 m.globalAlpha=1;m.globalCompositeOperation='destination-in';m.drawImage(image,0,0,256,256);m.globalCompositeOperation='source-over';c.drawImage(mold,0,0);
 if(wet>0){c.save();c.globalAlpha=wet;for(const d of [{x:61,y:141,r:5},{x:141,y:166,r:3},{x:196,y:146,r:3.5}]){ellipse(c,d.x,d.y,d.r,d.r*1.24,'rgba(220,237,208,.12)');c.beginPath();c.ellipse(d.x-1,d.y-1,d.r*.6,d.r*.7,-.3,Math.PI,Math.PI*1.6);c.strokeStyle='rgba(255,255,237,.5)';c.lineWidth=1;c.stroke()}c.restore()}
 fungus(59,177,1,.46,p,time,dry,clean);fungus(183,187,.72,.49,p,time+1.5,dry,clean);fungus(91,201,.42,.52,p,time+.7,dry,clean);
 if(clean>0&&clean<1){c.save();c.globalAlpha=Math.sin(clean*Math.PI)*.6;for(let i=0;i<9;i++){const x=38+i*23,y=220-clean*100+Math.sin(i*2)*9;ellipse(c,x,y,3+i%3,3+i%3,'rgba(245,250,235,.7)')}c.restore()}
 c.restore();for(const id of ['native','detail']){const cv=$(id),ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(surface,0,0,cv.width,cv.height)}
 const si=stageIndex(p);$('stage').textContent=states[si][0];$('description').textContent=states[si][1];document.querySelectorAll('.stages span').forEach((el,i)=>el.classList.toggle('active',i===si));$('timeline').value=Math.round(p*1000);
}
function start(which){mode=which;progress=0;clock=0;last=performance.now();playing=true;$('pause').textContent='暂停';render(0)}
$('play').onclick=()=>start('full');$('intro').onclick=()=>start('intro');$('pause').onclick=()=>{if(!playing&&progress>=(mode==='intro'?.76:1)){start(mode);return}last=performance.now();playing=!playing;$('pause').textContent=playing?'暂停':'继续'};
$('reset').onclick=()=>{playing=false;progress=clock=0;render(0);$('pause').textContent='继续'};
$('timeline').oninput=e=>{playing=false;mode='full';progress=Number(e.target.value)/1000;clock=progress*24;render(progress,clock);$('pause').textContent='继续'};
$('wall').onchange=e=>$('scene').className='scene '+e.target.value;
function tick(now){const dt=Math.max(0,(now-last)/1000);last=now;if(playing&&ready){const rate=Number($('speed').value);clock+=dt*rate;const end=mode==='intro'?.76:1;progress=Math.min(end,progress+dt*rate*(mode==='intro'?.76/4:1/24));render(progress,clock);if(progress>=end){playing=false;$('pause').textContent='继续'}}requestAnimationFrame(tick)}
image.onload=()=>{ready=true;mc.drawImage(image,0,0,256,256);render(0);window.previewReady=true};image.onerror=()=>$('error').textContent=' 图标载入失败，请重新提取。';requestAnimationFrame(tick);
window.preview={seek(p){playing=false;progress=clamp(p);render(progress,progress*24)},getState(){return{progress,playing,mode,ready,iconSize:dimensions.native}},measureCoverage(){const base=mc.getImageData(0,0,256,256).data,visible=c.getImageData(128,164,256,256).data;let affected=0,total=0;for(let i=0;i<base.length;i+=4){if(base[i+3]<128)continue;total++;if(Math.hypot(base[i]-visible[i],base[i+1]-visible[i+1],base[i+2]-visible[i+2])>45)affected++}return{affected,total,ratio:affected/total,method:'Original alpha >=128; RGB Euclidean difference >45. Visual-change proxy, not formal occlusion certification.'}}};
