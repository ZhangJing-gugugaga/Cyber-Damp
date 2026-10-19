import { Filter, GlProgram } from 'pixi.js';

export const materialVertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  p.x = p.x * 2.0 / uOutputTexture.x - 1.0;
  p.y = p.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z;
  gl_Position = vec4(p, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;

const fragment = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uWet;
uniform float uMold;
uniform float uChar;
uniform float uDry;
uniform float uTime;
uniform float uMediaWet;
uniform vec4 uPaintSpot0;
uniform vec4 uPaintColor0;
uniform vec4 uPaintSpot1;
uniform vec4 uPaintColor1;
uniform vec4 uPaintSpot2;
uniform vec4 uPaintColor2;
uniform vec4 uPaintSpot3;
uniform vec4 uPaintColor3;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec4 sampleIcon(vec2 p) { return texture(uTexture, mix(uInputClamp.xy,uInputClamp.zw,clamp(p,0.0,1.0))); }
vec3 pigment(vec3 rgb, float alpha, vec2 p, vec4 spot, vec4 tint) {
  if (spot.z<=0.0) return rgb;
  float edge=noise(p*62.0)*0.028;
  float distance=length((p-spot.xy)*vec2(1.0,1.2));
  float stain=(1.0-smoothstep(spot.z*0.52,spot.z+edge,distance))*spot.w;
  // Watercolour preserves the native picture and the source's premultiplied alpha.
  return mix(rgb,rgb*0.55+tint.rgb*alpha*0.45,stain);
}
void main() {
  vec2 p=(vTextureCoord-uInputClamp.xy)/(uInputClamp.zw-uInputClamp.xy);
  vec2 source=p;
  // Wet cardboard narrows and sags at the bottom; curled corners retract.
  float bottom=smoothstep(0.35,1.0,p.y);
  source.x=0.5+(p.x-0.5)/(1.0-uWet*bottom*0.09);
  source.y-=uWet*0.04*sin(p.x*3.14159)*bottom;
  float corner=pow(abs(p.x-0.5)*2.0,5.0)*pow(abs(p.y-0.5)*2.0,5.0);
  source+=(p-0.5)*corner*(uDry*0.2+uChar*0.22);
  vec4 color=sampleIcon(source);
  if (source.x<0.0||source.x>1.0||source.y<0.0||source.y>1.0) color=vec4(0);
  if(color.a<0.004) { gl_FragColor=vec4(0); return; }
  float luminance=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
  color.rgb=mix(color.rgb,vec3(luminance),0.30*uMediaWet);
  // All material is multiplied into the original native pixel, preserving alpha.
  vec2 d=min(p,1.0-p);
  float corners=length(d);
  float grain=noise(p*42.0)*0.6+noise(p*113.0)*0.4;
  float moss=(1.0-smoothstep(uMold*0.34,uMold*0.34+0.08,corners+noise(p*17.0)*0.1));
  moss*=uMold;
  vec3 mossColor=mix(vec3(0.24,0.30,0.13),vec3(0.06,0.09,0.055),grain);
  color.rgb*=mix(vec3(1),mossColor,moss*0.85);
  float scorch=(1.0-smoothstep(uChar*0.65,uChar*0.65+0.14,corners+grain*0.07))*uChar;
  color.rgb*=mix(vec3(1),mix(vec3(0.36,0.14,0.035),vec3(0.045),scorch),scorch);
  float crease=pow(abs(sin((p.x+p.y*0.43)*37.0+noise(p*8.0)*4.0)),20.0);
  color.rgb*=mix(vec3(1),vec3(0.89,0.76,0.48)*(1.0-crease*0.25),uDry);
  color.rgb=pigment(color.rgb,color.a,source,uPaintSpot0,uPaintColor0);
  color.rgb=pigment(color.rgb,color.a,source,uPaintSpot1,uPaintColor1);
  color.rgb=pigment(color.rgb,color.a,source,uPaintSpot2,uPaintColor2);
  color.rgb=pigment(color.rgb,color.a,source,uPaintSpot3,uPaintColor3);
  // Six raised water lenses: dark lower rims, refraction and a bright glint.
  for(int i=0;i<6;i++) {
    float f=float(i);
    vec2 center=vec2(0.12+hash(vec2(f,2))*0.76,0.12+hash(vec2(f,7))*0.68);
    center.y+=max(0.0,sin(uTime*0.35+f*2.0)-0.8)*0.24;
    float radius=0.023+hash(vec2(f,3))*0.027;
    vec2 bead=(p-center)/radius;
    float distance=length(bead);
    float lens=(1.0-smoothstep(0.8,1.05,distance))*uWet;
    color.rgb=mix(color.rgb,color.rgb*0.68,lens*max(0.0,bead.y)*0.6);
    float glint=1.0-smoothstep(0.04,0.35,length(bead-vec2(-0.30,-0.35)));
    color.rgb=mix(color.rgb,vec3(color.a),glint*lens*0.92);
    color.rgb+=vec3(0.10,0.14,0.16)*lens*color.a*max(0.0,1.0-distance);
  }
  gl_FragColor=color;
}`;

export class MaterialFilter extends Filter {
  private nextStain = 0;
  constructor() {
    super({ glProgram: new GlProgram({vertex: materialVertex, fragment}), resources: { material: {
      uWet:{value:0,type:'f32'}, uMold:{value:0,type:'f32'}, uChar:{value:0,type:'f32'},
      uDry:{value:0,type:'f32'}, uTime:{value:0,type:'f32'},
      uMediaWet:{value:0,type:'f32'},
      uPaintSpot0:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintColor0:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintSpot1:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintColor1:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintSpot2:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintColor2:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintSpot3:{value:new Float32Array(4),type:'vec4<f32>'},
      uPaintColor3:{value:new Float32Array(4),type:'vec4<f32>'},
    } } });
  }
  update(wet:number, mold:number, char:number, dry:number, time:number, mediaWet=0):void {
    Object.assign(this.resources.material.uniforms, {uWet:wet,uMold:mold,uChar:char,uDry:dry,uTime:time,uMediaWet:Math.min(1,Math.max(0,mediaWet))});
  }

  /** Last four splashes remain on the surrogate, clipped by original native alpha. */
  addPaintStain(u:number,v:number,color:number):void {
    const index=this.nextStain++%4;
    const uniforms=this.resources.material.uniforms;
    (uniforms[`uPaintSpot${index}`] as Float32Array).set([u,v,0.19,0.95]);
    (uniforms[`uPaintColor${index}`] as Float32Array).set([(color>>16&255)/255,(color>>8&255)/255,(color&255)/255,1]);
  }

  clearPaintStains():void {
    for(let i=0;i<4;i++) (this.resources.material.uniforms[`uPaintSpot${i}`] as Float32Array).fill(0);
  }
}
