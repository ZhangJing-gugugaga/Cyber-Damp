import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('edge fog retains every painted texel exactly once and omits only transparent pixels', () => {
  for(const [width,height] of [[1536,864],[768,1200],[100,80]]) {
    let canvas;
    class Container { children=[]; addChild(child) { this.children.push(child); } }
    class Rectangle { constructor(x,y,width,height) { Object.assign(this,{x,y,width,height}); } }
    class Texture { constructor(options) { Object.assign(this,options); } static from(resource) { return new Texture({source:{resource}}); } }
    class Sprite { constructor(texture) { this.texture=texture; } }
    const document={createElement(){ canvas={width:0,height:0,getContext(){return {
      createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(image){canvas.pixels=image.data;},
    };}};return canvas;}};
    const module={};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/renderer/app/atmosphere.ts','utf8'),
      {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
      {exports:module,document,require:id=>id==='pixi.js'?{Container,Rectangle,Texture,Sprite}:{}});
    const layer=new Container(); new module.Atmosphere({screen:{width,height}},{fogLayer:layer});
    const coverage=new Uint8Array(canvas.width*canvas.height);
    for(const sprite of layer.children[0].children) {
      const f=sprite.texture.frame;
      assert.equal(sprite.x, f.x/canvas.width*width); assert.equal(sprite.y,f.y/canvas.height*height);
      for(let y=f.y;y<f.y+f.height;y++)for(let x=f.x;x<f.x+f.width;x++)coverage[y*canvas.width+x]++;
    }
    for(let i=0;i<coverage.length;i++) {
      assert.ok(coverage[i]<=1,'Fog strips must not darken overlaps');
      if(canvas.pixels[i*4+3]>0)assert.equal(coverage[i],1,'Painted edge lost');
    }
    if(width>500 && height>500)assert.ok(coverage.reduce((a,b)=>a+b,0)<coverage.length*.5,'Transparent center should not be drawn');
  }
});
