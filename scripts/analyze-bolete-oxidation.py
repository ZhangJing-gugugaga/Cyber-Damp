"""Inspect native GDI bolete cut footage without resampling or gameplay writes."""
from pathlib import Path
import json,re,subprocess
import numpy as np
from PIL import Image,ImageDraw

root=Path('logs/oxidation-uat')
ffmpeg=Path('logs/ripple-uat/ffmpeg-path.txt').read_text(encoding='utf-8-sig').strip()
record_log=(root/'cut-ffmpeg.err.log').read_text(errors='replace')
start=float(re.search(r'demuxer ->.*?pkt_pts_time:([0-9.]+)',record_log)[1])
samples=json.loads((root/'cut-pose.json').read_text(encoding='utf-8-sig'))
first=next(s for s in samples if s['harvest'])
down=next(i for i in first['input'] if i['type']=='pointerdown' and abs(i.get('x',0)-658.4)<1 and abs(i.get('y',0)-448)<1)
clock_offsets=np.array([s['wallTime']-s['timeOrigin']-s['time'] for s in samples])
cut_video=(first['timeOrigin']+down['at'])/1000-start
proc=subprocess.run([ffmpeg,'-hide_banner','-i',str(root/'cut-native.mp4'),'-vf','showinfo','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True)
pts=np.array([float(t) for t in re.findall(rb' n:\s*\d+.*?pts_time:([0-9.]+)',proc.stderr)])
frames=np.frombuffer(proc.stdout,np.uint8).reshape((-1,160,160,3))
assert len(frames)==len(pts)
h=first['harvest'][0]
cx=round(h['x']*1.25-760);cy=round((h['y']+1)*1.25-490)
# Interior below the small glint, kept away from the antialiased rim.
core=frames[:,cy+1:cy+3,cx-2:cx+3,:]
colors=np.median(core,axis=(1,2))
relative=(pts-cut_video)*1000
blue=(colors[:,2]>=120)&(colors[:,0]<colors[:,2]*.4)&(colors[:,1]<colors[:,2]*.6)
indices=np.where((relative>=0)&blue)[0]
first_blue=int(indices[0]) if len(indices) else None
settled=np.median(colors[(relative>1000)&(relative<2000)],axis=0)
close=np.linalg.norm(colors-settled,axis=1)<10
near=np.where((relative>=0)&close)[0]
first_settled=int(near[0]) if len(near) else None
full=next(s for s in samples if s['harvest'] and s['harvest'][0]['cutAgeSeconds']>=.5)
prev=samples[samples.index(full)-1]
rows=[{'pts':float(p),'afterNativeDownMs':float(t),'medianRGB':c.tolist(),'deepBlue':bool(b)} for p,t,c,b in zip(pts,relative,colors,blue) if -200<t<1500]
summary={
 'source':'cut-native.mp4','originalFrames':len(frames),'durationPTS':float(pts[-1]),'averageFPS':float((len(pts)-1)/pts[-1]),
 'medianFrameGapMs':float(np.median(np.diff(pts))*1000),'maxCutFrameGapMs':float(np.max(np.diff(pts[(relative>-200)&(relative<1000)]))*1000),
 'gdiFirstEpochSeconds':start,'nativeDown':down,'nativeDownVideoSeconds':cut_video,
 'clockOffsetWallMinusOriginPerformanceMs':{'min':float(clock_offsets.min()),'max':float(clock_offsets.max()),'median':float(np.median(clock_offsets))},
 'faceCoreLocalBox':[cx-2,cy+1,cx+3,cy+3],
 'deepBlueCriterion':'median B>=120, R/B<0.4, G/B<0.6 in 10 interior pixels; a visible-color criterion, not exact endpoint proof',
 'firstDeepBlueAfterDownMs':float(relative[first_blue]) if first_blue is not None else None,
 'previousFrameAfterDownMs':float(relative[first_blue-1]) if first_blue else None,
 'settledMedianRGB':settled.tolist(),'firstWithin10RGBOfSettledMs':float(relative[first_settled]) if first_settled is not None else None,
 'stateFirstFullAfterDownMs':full['time']-down['at'],'statePreviousAge':prev['harvest'][0]['cutAgeSeconds'],
 'statePreviousAfterDownMs':prev['time']-down['at'],
 'limitations':['Capture timestamps precede display readout; frame spacing and OS clock correlation limit precise onset.','A dark-blue threshold does not prove every face pixel reached the final color by500ms.','This is one native cut on portable0.1.8, not independent Computer Use mouse acceptance.'],
 'frames':rows}
(root/'cut-analysis.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
contact=Image.new('RGB',(7*240,4*264),'#ddd');draw=ImageDraw.Draw(contact)
for j,t in enumerate(range(-50,1301,50)):
 i=int(np.argmin(abs(relative-t)));im=Image.fromarray(frames[i]).resize((240,240),Image.Resampling.NEAREST)
 x=j%7*240;y=j//7*264;contact.paste(im,(x,y+24));draw.text((x+4,y+4),f'{relative[i]:+.1f}ms RGB '+','.join(str(int(v)) for v in colors[i]),fill='#111')
contact.save(root/'cut-timed-contact.png')
print(json.dumps({k:v for k,v in summary.items() if k!='frames'},indent=2))
