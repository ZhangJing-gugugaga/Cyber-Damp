/** Drawing paths migrated from frozen approved preview (2026-10-20).
 * No autonomous cleaning. Material and growth inputs come only from file state.
 * Stable seed is sampled once; redraw is capped to 20 Hz for gentle sway. */
import { allocateCanvasRegion } from './canvas-atlas';
interface Spot {x:number;y:number;r:number;birth:number;tone:number;phase:number;outline?:ReadonlyArray<readonly [number,number]>}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{v=clamp((v-a)/(b-a));return v*v*(3-2*v)};
export function createMildewSurface(image:CanvasImageSource, seedValue:number, pixels:number,attach?:(u:number,v:number)=>{u:number;v:number}|null){
 const surface=document.createElement('canvas');surface.width=surface.height=Math.max(64,Math.min(256,pixels));
 const hitContext=document.createElement('canvas').getContext('2d')!;
 const fungusPaths:Path2D[]=[];
 type CoveragePath={path:Path2D;alpha:number;strokeWidth?:number};
 const colonyCoverage:CoveragePath[]=[],fungusCoverage:CoveragePath[]=[];
 const coverageEllipse=(x:number,y:number,rx:number,ry:number,alpha:number)=>{
  const path=new Path2D();path.ellipse(x,y,rx,ry,0,0,Math.PI*2);fungusCoverage.push({path,alpha});
 };
 const c=surface.getContext('2d')!; c.scale(surface.width/256,surface.height/256);
 const mold=document.createElement('canvas');mold.width=mold.height=256;
 const m=mold.getContext('2d')!;
 const material=document.createElement('canvas');material.width=material.height=surface.width;
 const base=material.getContext('2d')!;base.scale(material.width/256,material.height/256);
 let materialKey='';
 let seed=seedValue;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const clusters=[{x:55+(rand()-.5)*42,y:176+(rand()-.5)*44,rx:32+rand()*24,ry:24+rand()*20},
 {x:183+(rand()-.5)*36,y:184+(rand()-.5)*38,rx:26+rand()*22,ry:20+rand()*20},
 {x:110+(rand()-.5)*50,y:207+(rand()-.5)*22,rx:25+rand()*28,ry:14+rand()*16}];
 if(attach)for(const cluster of clusters){const root=attach(cluster.x/256,cluster.y/256);if(root){cluster.x=root.u*256;cluster.y=root.v*256}}
 const births=clusters.map(()=>.44+rand()*.09);
 const spots:Spot[]=Array.from({length:460},()=>{const a=rand()*Math.PI*2,r=Math.sqrt(rand()),k=clusters[Math.floor(rand()*3)];return{x:k.x+Math.cos(a)*r*k.rx,y:k.y+Math.sin(a)*r*k.ry,r:.6+rand()*2.6,birth:.20+r*.19+rand()*.12,tone:rand(),phase:rand()*6.28}});
 function ellipse(ctx: CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill()}
function colony(ctx: CanvasRenderingContext2D,s: Spot,r:number){
 if(!s.outline)s.outline=Array.from({length:10},(_,i)=>{const a=i/9*Math.PI*2,edge=1+.20*Math.sin(a*3+s.phase)+.12*Math.cos(a*5+s.phase);return [Math.cos(a)*edge,Math.sin(a)*edge*.76] as const});
 const path=new Path2D();s.outline.forEach(([dx,dy],i)=>{const x=s.x+dx*r,y=s.y+dy*r;i?path.lineTo(x,y):path.moveTo(x,y)});path.closePath();ctx.fillStyle=s.tone>.5?'#4e5944':'#798368';ctx.fill(path);colonyCoverage.push({path,alpha:ctx.globalAlpha});
}
function fungus(rootX:number,rootY:number,scale:number,birth:number,p:number,time:number,dry:number,clean:number){
 const g=smooth(birth,birth+.20,p);if(g<=0||clean>=1)return;
 const emerge=smooth(0,.2,g),stemH=(3+52*smooth(.04,.85,g))*scale;
 const capOpen=smooth(.25,1,g),w=(3+28*capOpen)*scale,h=(5+13*capOpen)*scale;
 const sway=Math.sin(time*1.5+birth*19)*2.2*scale*g;
 const topX=rootX+sway,topY=rootY-stemH;
 c.save();c.globalAlpha=emerge*(1-clean);ellipse(c,rootX,rootY+1,10*scale,3*scale,'rgba(47,55,31,.23)');
 coverageEllipse(rootX,rootY+1,10*scale,3*scale,c.globalAlpha*.23);
 const stem=c.createLinearGradient(rootX-5*scale,0,rootX+7*scale,0);stem.addColorStop(0,'#b5b59a');stem.addColorStop(.4,'#eee8cf');stem.addColorStop(1,'#c6c9ad');
 const stemPath=new Path2D();stemPath.moveTo(rootX-4*scale,rootY);stemPath.bezierCurveTo(rootX-6*scale,rootY-stemH*.25,topX-5*scale,topY+8*scale,topX-4*scale,topY);stemPath.lineTo(topX+5*scale,topY);stemPath.bezierCurveTo(topX+3*scale,topY+stemH*.5,rootX+6*scale,rootY-5*scale,rootX+5*scale,rootY);stemPath.closePath();c.fillStyle=stem;c.fill(stemPath);fungusPaths.push(stemPath);
 ellipse(c,topX,topY+1,w,h*.31,'#b9af8e');
 coverageEllipse(topX,topY+1,w,h*.31,c.globalAlpha);
 fungusCoverage.push({path:stemPath,alpha:c.globalAlpha});
 c.save();c.beginPath();c.ellipse(topX,topY+1,w*.9,h*.24,0,0,Math.PI);c.clip();c.strokeStyle='rgba(104,93,71,.21)';c.lineWidth=.7;for(let i=-8;i<=8;i++){c.beginPath();c.moveTo(topX,topY-2);c.lineTo(topX+i*w/8,topY+h*.36);c.stroke()}c.restore();
 const grad=c.createLinearGradient(topX-w,topY-h,topX+w*.6,topY+2);grad.addColorStop(0,dry>.5?'#c8b598':'#d4c499');grad.addColorStop(.32,dry>.5?'#b7a083':'#c5ad79');grad.addColorStop(1,dry>.5?'#8f816e':'#8d9363');
 const capPath=new Path2D();capPath.moveTo(topX-w,topY);capPath.bezierCurveTo(topX-w*.94,topY-h*.48,topX-w*.57,topY-h*1.1,topX,topY-h);capPath.bezierCurveTo(topX+w*.64,topY-h*.96,topX+w*.91,topY-h*.4,topX+w,topY);capPath.bezierCurveTo(topX+w*.5,topY+h*.13,topX-w*.55,topY+h*.1,topX-w,topY);c.fillStyle=grad;c.fill(capPath);fungusPaths.push(capPath);
 fungusCoverage.push({path:capPath,alpha:c.globalAlpha});
 c.beginPath();c.moveTo(topX-w*.7,topY-h*.36);c.bezierCurveTo(topX-w*.32,topY-h*.8,topX+w*.1,topY-h*.88,topX+w*.38,topY-h*.61);c.strokeStyle='rgba(255,249,220,'+(.20*(1-dry))+')';c.lineWidth=2*scale;c.stroke();c.restore();
}

 const region=allocateCanvasRegion(surface.width),texture=region.texture;
 let previousKey='',lastTime=-Infinity;
 return {texture,
 measureOcclusion(pixels=64){
  const size=Math.max(1,Math.round(pixels));
  const canvas=()=>{const value=document.createElement('canvas');value.width=value.height=size;return value;};
  const source=canvas(),sourceContext=source.getContext('2d')!;sourceContext.drawImage(image,0,0,size,size);
  const layer=(paths:CoveragePath[],clip:boolean)=>{const value=canvas(),ctx=value.getContext('2d')!;ctx.scale(size/256,size/256);ctx.fillStyle='white';
   for(const shape of paths){ctx.globalAlpha=shape.alpha;if(shape.strokeWidth){ctx.strokeStyle='white';ctx.lineWidth=shape.strokeWidth;ctx.stroke(shape.path)}else ctx.fill(shape.path)}
   if(clip){ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(image,0,0,256,256)}return value;};
  const colonies=layer(colonyCoverage,true),fungi=layer(fungusCoverage,false),union=canvas(),ctx=union.getContext('2d')!;
  const original=sourceContext.getImageData(0,0,size,size).data,a=colonies.getContext('2d')!.getImageData(0,0,size,size).data,b=fungi.getContext('2d')!.getImageData(0,0,size,size).data;
  const result=ctx.createImageData(size,size);let total=0,covered=0;
  for(let i=0;i<original.length;i+=4){if(original[i+3]<128)continue;total++;if(a[i+3]>=13||b[i+3]>=13){covered++;result.data[i]=result.data[i+1]=result.data[i+2]=result.data[i+3]=255}}
  ctx.putImageData(result,0,0);return {scope:'mildew-and-fungi-before-deformation' as const,pixels:size,total,covered,ratio:total?covered/total:0,source,colonies,fungi,union};
 }, hitFungus(x:number,y:number){return fungusPaths.some(path=>hitContext.isPointInPath(path,x,y));}, update(wet:number,moldAmount:number,growth:number,time:number){
  const key=[wet,moldAmount,growth].map(v=>Math.round(v*1000)).join(':');
  if(key===previousKey && (growth<=0 || time-lastTime<.05))return;
  if(time-lastTime<.025 && key===previousKey)return;
  previousKey=key;lastTime=time;fungusPaths.length=0;fungusCoverage.length=0;
  const p=moldAmount>0?.16+moldAmount*.65:0,dry=1-wet,clean=0;
   c.clearRect(0,0,256,256);c.save();
 const nextMaterialKey=[wet,moldAmount].map(v=>Math.round(v*1000)).join(':');
 if(nextMaterialKey!==materialKey){
 colonyCoverage.length=0;
 materialKey=nextMaterialKey;
 base.clearRect(0,0,256,256);base.drawImage(image,0,0,256,256);
 m.clearRect(0,0,256,256);m.globalCompositeOperation='source-over';
 // Moisture is localized to the material, never a black frame around its bounds.
 const wash=m.createRadialGradient(70,168,0,70,168,105);wash.addColorStop(0,'rgba(59,95,61,'+(.14*wet)+')');wash.addColorStop(1,'rgba(59,95,61,0)');m.fillStyle=wash;m.fillRect(0,0,256,256);
 for(const s of spots){const grow=smooth(s.birth,s.birth+.12,p)*(1-clean);if(grow<=0)continue;const r=s.r*(.25+grow*.85)*(1+smooth(.7,1,moldAmount)*4.5);m.globalAlpha=grow*(.34+s.tone*.32);colony(m,s,r);
 if(p>.36){m.globalAlpha=smooth(.36,.55,p)*.10*(1-clean);ellipse(m,s.x+.4,s.y-.3,r*2.1,r*1.8,'#9da98a');const halo=new Path2D();halo.ellipse(s.x+.4,s.y-.3,r*2.1,r*1.8,0,0,Math.PI*2);colonyCoverage.push({path:halo,alpha:m.globalAlpha})}
 if(p>.45&&s.tone>.83){m.globalAlpha=.24*smooth(.45,.58,p)*(1-clean);m.strokeStyle='#c1c7a5';m.lineWidth=.6;const fringe=new Path2D();fringe.moveTo(s.x,s.y);fringe.quadraticCurveTo(s.x-1,s.y-2,s.x+Math.sin(s.phase)*3,s.y-3);m.stroke(fringe);colonyCoverage.push({path:fringe,alpha:m.globalAlpha,strokeWidth:.6})}}
 m.globalAlpha=1;m.globalCompositeOperation='destination-in';m.drawImage(image,0,0,256,256);m.globalCompositeOperation='source-over';base.drawImage(mold,0,0);
 }
 c.drawImage(material,0,0,256,256);
 if(wet>0){c.save();c.globalAlpha=wet;for(const d of [{x:61,y:141,r:5},{x:141,y:166,r:3},{x:196,y:146,r:3.5}]){ellipse(c,d.x,d.y,d.r,d.r*1.24,'rgba(220,237,208,.12)');c.beginPath();c.ellipse(d.x-1,d.y-1,d.r*.6,d.r*.7,-.3,Math.PI,Math.PI*1.6);c.strokeStyle='rgba(255,255,237,.5)';c.lineWidth=1;c.stroke()}c.restore()}
 if(growth>0){const gp=.44+growth*.38;clusters.forEach((cluster,i)=>fungus(cluster.x,cluster.y,[1,.72,.42][i],births[i],gp,time+i*1.3,dry,0));}

  c.restore();region.update(surface);
 },destroy(){region.destroy()}};
}
