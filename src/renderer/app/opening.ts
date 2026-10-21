/** Four-second reveal, measured from the first visible animation frame.
 * Prompt and asset loading happen before desktopReady, outside this clock. */
import type { WorldRuntime } from './world-runtime';
import type { Atmosphere } from './atmosphere';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { FileSprite } from '../view/file-sprite';
import type { MushroomView } from '../view/mushroom-view';
const smooth=(a:number,b:number,t:number)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x)};
export interface OpeningDeps {
 runtime:WorldRuntime; atmosphere:Atmosphere; pool:ParticlePool; sfx:Sfx;
 sprites:Map<string,FileSprite>; shrooms:Map<string,MushroomView>;
 onToast(text:string):void; onFinish():void;
}
export class Opening {
 private started:number|null=null;
 private done=false;
 private pausedAt:number|null=null;
 private pausedMs=0;
 private growthReveal=0;
 get mushroomReveal():number{return this.growthReveal}
 setPaused(paused:boolean):void{
  if(paused){if(this.pausedAt===null)this.pausedAt=performance.now()}
  else if(this.pausedAt!==null){if(this.started!==null)this.pausedMs+=performance.now()-this.pausedAt;this.pausedAt=null}
 }
 constructor(private deps:OpeningDeps){
  for(const sprite of deps.sprites.values()){sprite.setIntro(0,0);sprite.setIntroGrowth(0)}
  for(const view of deps.shrooms.values())view.container.visible=false;
 }
 update(_dt:number):boolean {
  if(this.done)return true;
  if(this.pausedAt!==null)return false;
  const now=performance.now();if(this.started===null)this.started=now;
  const elapsed=now-this.started-this.pausedMs,p=Math.min(1,elapsed/4000);
  this.growthReveal=smooth(.57,1,p);
  for(const sprite of this.deps.sprites.values()){
   sprite.setIntro(smooth(0,.25,p),smooth(.15,.72,p));sprite.setIntroGrowth(this.growthReveal);
  }
  this.deps.atmosphere.introFog=0;
  if(p>=1){
   this.done=true;for(const sprite of this.deps.sprites.values())sprite.finishIntro();
   this.deps.runtime.locked=false;this.deps.atmosphere.introFog=-1;
   console.info('[opening]',JSON.stringify({startedAt:this.started,finishedAt:now,elapsedMs:elapsed,pausedMs:this.pausedMs}));
   this.deps.onFinish();
  }
  return this.done;
 }
}
