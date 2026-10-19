// Render the production water shader on a native WebGL2 context. No desktop input.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const source=fs.readFileSync('src/renderer/view/shaders/box-fill-filter.ts','utf8');
 const fragment=source.match(/fragment:\s*`([\s\S]*?)`/)[1];
 const vertex=fs.readFileSync('src/renderer/view/shaders/material-filter.ts','utf8').match(/export const materialVertex = `([\s\S]*?)`/)[1];
 const win=new BrowserWindow({show:false,webPreferences:{offscreen:true}});
 await win.loadURL('data:text/html,<html><body></body></html>');
 const result=await win.webContents.executeJavaScript(`(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const gl=canvas.getContext('webgl2',{premultipliedAlpha:true,alpha:true,antialias:false});
  if(!gl)throw new Error('Native WebGL2 unavailable');
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
  const vs=compile(gl.VERTEX_SHADER,'#version 300 es\\nprecision highp float;\\n'+${JSON.stringify(vertex)});
  const ps=compile(gl.FRAGMENT_SHADER,'#version 300 es\\nprecision highp float;\\nout vec4 finalColor;\\n#define gl_FragColor finalColor\\n'+${JSON.stringify(fragment)});
  const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,ps);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const loc=name=>gl.getUniformLocation(program,name);
  gl.uniform4f(loc('uInputSize'),32,32,1/32,1/32);gl.uniform4f(loc('uOutputFrame'),0,0,32,32);gl.uniform4f(loc('uOutputTexture'),32,32,1,0);gl.uniform4f(loc('uInputClamp'),0,0,1,1);gl.uniform1i(loc('uTexture'),0);gl.uniform1f(loc('uTime'),2.3);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const cases=[];
  for(const angle of [0,110])for(const fill of [0,.25,1])for(const wave of [.008,.045]){
   const input=new Uint8Array(32*32*4),r=angle*Math.PI/180;
   for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const dx=(x+.5-16)/16,dy=(y+.5-16)/16;
    const u=dx*Math.cos(r)+dy*Math.sin(r),v=-dx*Math.sin(r)+dy*Math.cos(r);
    const inside=Math.abs(u)<.60&&Math.abs(v)<.72;
    const a=inside?(Math.abs(u)>.42?24:Math.abs(v)>.5?80:255):0;
    const i=(y*32+x)*4;input.set([Math.round(a*.8),Math.round(a*.85),Math.round(a*.9),a],i);
   }
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,32,32,0,gl.RGBA,gl.UNSIGNED_BYTE,input);gl.uniform1f(loc('uFill'),fill);gl.uniform1f(loc('uWave'),wave);gl.viewport(0,0,32,32);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
   const output=new Uint8Array(input.length);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,output);
   let outside=0,alphaIncrease=0,badPremultiplication=0,changedInterior=0;
   for(let i=0;i<output.length;i+=4){if(input[i+3]===0&&output.slice(i,i+4).some(v=>v))outside++;if(output[i+3]>input[i+3]+1)alphaIncrease++;if(output.slice(i,i+3).some(v=>v>output[i+3]+1))badPremultiplication++;if(input[i+3]>0&&output.slice(i,i+4).some((v,j)=>Math.abs(v-input[i+j])>1))changedInterior++;}
   cases.push({angle,fill,wave,outside,alphaIncrease,badPremultiplication,changedInterior});
  }
  return {renderer:gl.getParameter(gl.RENDERER),cases};
 })()`);
 const dest=process.argv[2]||'logs/box-water-uat/shader-alpha.json';fs.mkdirSync(require('node:path').dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 win.destroy();
 assert.ok(result.cases.every(c=>c.outside===0&&c.alphaIncrease===0&&c.badPremultiplication===0),'Water must preserve transparent/partial-alpha silhouette and premultiplied colors at0/110 degrees');
 assert.ok(result.cases.some(c=>c.fill===1&&c.changedInterior>0),'The regression must actually exercise water shading');
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
