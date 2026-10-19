import { Filter, GlProgram } from 'pixi.js';
import { materialVertex } from './material-filter';

export class BoxFillFilter extends Filter {
  constructor() {
    super({glProgram:new GlProgram({vertex:materialVertex,fragment:`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uFill;
uniform float uTime;
uniform float uWave;
void main() {
  vec2 p=(vTextureCoord-uInputClamp.xy)/(uInputClamp.zw-uInputClamp.xy);
  vec4 art=texture(uTexture,vTextureCoord);
  // The filter target is the rotated sprite's rectangular bounds. Water and
  // dissolved granules must never paint into its transparent corners.
  if(art.a<=0.0) { gl_FragColor=vec4(0.0); return; }
  bool inside=p.x>0.075&&p.x<0.925&&p.y>0.26&&p.y<0.91;
  float wave=sin(p.x*16.0+uTime*4.0)*uWave;
  float waterline=0.91-uFill*0.52+wave;
  if(inside&&p.y>waterline) {
    float rim=1.0-smoothstep(0.0,0.015,p.y-waterline);
    float alpha=min(art.a,0.55);
    art=vec4(mix(vec3(0.26,0.48,0.56),vec3(0.8),rim)*alpha,alpha);
  } else if(inside&&p.y>0.26+(1.0-uFill)*0.33) {
    float alpha=min(art.a,0.12);
    art=vec4(vec3(0.75)*alpha,alpha);
  }
  gl_FragColor=art;
}`}),resources:{water:{uFill:{value:0,type:'f32'},uTime:{value:0,type:'f32'},uWave:{value:0.01,type:'f32'}}}});
  }
  update(fill:number,time:number,shaking:boolean):void {
    Object.assign(this.resources.water.uniforms,{uFill:fill,uTime:time,uWave:shaking?0.045:0.008});
  }
}
