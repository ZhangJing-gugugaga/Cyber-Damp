from pathlib import Path
import subprocess,json,re,io,numpy as np
from PIL import Image,ImageDraw
p=Path('logs/box-water-uat');ff=Path('logs/ripple-uat/ffmpeg-path.txt').read_text(encoding='utf-8-sig').strip()
origin=json.loads(json.loads((p/'source-origin.txt').read_text(encoding='utf-8-sig').strip()[7:]))['timeOrigin']/1000
slosh=json.loads((p/'slosh-pose.json').read_text());moving=[s for s in slosh['samples'] if s['boxes'] and abs(s['boxes'][0]['x']-1116)>1]
start=float(re.search(r'start: ([0-9.]+)',(p/'slosh-ffmpeg.err.log').read_text(errors='replace'))[1]);first=origin+moving[0]['time']/1000-start
print('slosh video first moving',first,'samples',len(moving))
def clip(video,width,height,lo,hi):
 r=subprocess.run([ff,'-hide_banner','-i',str(p/video),'-vf',f"select='between(t,{lo},{hi})',showinfo",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True)
 pts=[float(t) for t in re.findall(rb' n:\s*\d+.*?pts_time:([0-9.]+)',r.stderr)];a=np.frombuffer(r.stdout,np.uint8).reshape((-1,height,width,3));assert len(a)==len(pts);return pts,a
pts,a=clip('slosh-native.mp4',500,180,max(0,first-.2),first+2.5)
contact=Image.new('RGB',(6*240,3*200),'#ddd');draw=ImageDraw.Draw(contact)
for j,t in enumerate(np.linspace(first,first+2.1,18)):
 i=min(range(len(pts)),key=lambda k:abs(pts[k]-t));sample=min(slosh['samples'],key=lambda s:abs(origin+s['time']/1000-start-pts[i]));b=sample['boxes'][0];x=round(b['x']*1.25-1100);y=round(b['y']*1.25-870)
 im=Image.fromarray(a[i]).crop((x-6,y-5,x+66,y+50)).resize((240,180),Image.Resampling.NEAREST)
 xx=j%6*240;yy=j//6*200;contact.paste(im,(xx,yy+20));draw.text((xx+3,yy+3),f'video {pts[i]:.3f}s',fill='#111')
contact.save(p/'slosh-aligned-contact.png');del a
pts,a=clip('pour-native.mp4',320,250,12.8,14.9)
contact=Image.new('RGB',(6*240,4*260),'#ddd');draw=ImageDraw.Draw(contact)
for j,t in enumerate(np.linspace(13.2,14.35,24)):
 i=min(range(len(pts)),key=lambda k:abs(pts[k]-t));im=Image.fromarray(a[i]).crop((0,0,140,140)).resize((240,240),Image.Resampling.NEAREST);xx=j%6*240;yy=j//6*260;contact.paste(im,(xx,yy+20));draw.text((xx+3,yy+3),f'video {pts[i]:.3f}s',fill='#111')
contact.save(p/'pour-contact.png');del a
contact=Image.new('RGB',(5*250,220),'#ddd');draw=ImageDraw.Draw(contact)
for j,t in enumerate([1,15,25,40,59]):
 r=subprocess.run([ff,'-hide_banner','-ss',str(t),'-i',str(p/'refill-native.mp4'),'-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'],capture_output=True,check=True);im=Image.open(io.BytesIO(r.stdout)).crop((68,35,142,90)).resize((250,190),Image.Resampling.NEAREST);contact.paste(im,(j*250,30));draw.text((j*250+3,8),f'video {t}s',fill='#111')
contact.save(p/'refill-contact.png')
(p/'contact-provenance.json').write_text(json.dumps({'sloshFirstMovingPTS':first,'sloshMovingSamples':len(moving),'note':'Nearest original frames, visual contact sheets only; not interpolated timing proof.'},indent=2))
