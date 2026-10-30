// Project-authored editable SVG. Coordinates are local to each mushroom;
// All sprites share a transparent 256px canvas and a root at y=226.
const { extraArtwork, extraShapes } = require('./mushroom-varieties.cjs');
const shapes = ['round', 'cluster', 'fan', ...extraShapes];
const palettes = {
 amber: ['#ffe6a6','#efa654','#bb6550','#715650','#fff5da'],
 coral: ['#ffd3c2','#ed968b','#be657a','#805967','#fff0d8'],
 blue: ['#bdefff','#78b9eb','#526fc4','#405786','#e4f3ed'],
 violet: ['#e5d7f7','#b6a0da','#8670b0','#64577f','#f5e6e6'],
};
const path=(d,fill,stroke='',width=1.4,extra='')=>`<path d="${d}" fill="${fill}" ${stroke?`stroke="${stroke}" stroke-width="${width}"`:''} stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
function mushroom(id,kind,color,transform){
 const [light,mid,dark,ink,cream]=palettes[color];
 const bell=kind==='bell';
 const cap=bell?'M-53 1 C-41-11-40-32-29-54 C-23-69-13-82-2-80 C12-78 18-64 25-47 C31-28 39-16 51-9 C59-4 54 3 45 5 C38 4 36 10 28 9 C18 6 13 14 5 12 C-4 8-12 17-21 12 C-31 8-38 16-48 10 C-55 7-57 4-53 1Z':'M-69-4 C-65-31-48-54-21-64 C1-72 24-69 43-56 C62-44 71-25 72-9 C73 1 60 5 49 5 C33 4 22 10 6 9 C-9 7-21 15-37 11 C-52 10-71 9-69-4Z';
 const underside=bell?'M-52 5 C-25-8 20-12 52-3 C46 28-32 34-52 5Z':'M-65 2 C-33-10 34-14 68-3 C54 28-45 33-65 2Z';
 let s=`<g transform="${transform}"><defs><linearGradient id="${id}-cap" x1="20%" y1="0%" x2="80%" y2="100%"><stop stop-color="${light}"/><stop offset=".43" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="${id}-stem" x1="0%" x2="100%"><stop stop-color="${dark}"/><stop offset=".35" stop-color="${cream}"/><stop offset=".65" stop-color="#fff9e9"/><stop offset="1" stop-color="${mid}"/></linearGradient><clipPath id="${id}-gills">${path(underside,'white')}</clipPath><clipPath id="${id}-top">${path(cap,'white')}</clipPath></defs>`;
 s+=`<g id="${id}-stem">`+path('M-10 9 C-5 37 3 68-10 95 C-12 101-2 105 10 101 C31 77 21 45 14 8Z',`url(#${id}-stem)`,ink)+path('M-3 25 C1 49 13 77 3 94','none',light,2)+path('M12 34 C16 57 22 77 12 91','none',dark,.8,'opacity=".45"')+'</g>';
 s+=`<g id="${id}-gills-layer">`+path(underside,cream,ink)+`<g clip-path="url(#${id}-gills)" opacity=".65">`;
 for(let i=-65;i<=70;i+=5) s+=path(`M${i} -5 Q${i*.65} 14 2 25`,'none',ink,.7);
 s+='</g></g>';
 s+=`<g id="${id}-cap-layer">`+path(cap,`url(#${id}-cap)`,ink,1.8)+`<g clip-path="url(#${id}-top)">`;
 if(bell){
 for(let i=-45;i<=50;i+=9) s+=path(`M-2 -78 C${i*.4} -57 ${i*.3} -19 ${i} 8`,'none',i%2?light:dark,1.1,'opacity=".55"');
 s+=path('M-17-64 C-29-49-28-30-36-17','none',light,4,'opacity=".65"');
 } else {
 s+=path('M-51-28 C-39-47-21-55-8-55','none',light,5,'opacity=".75"');
 for(const [x,y,rx,ry,rot] of [[-39,-36,6,3,-30],[-17,-52,5,2,-12],[13,-47,9,4,17],[41,-31,6,3,31],[-15,-17,4,2,-10],[50,-13,3,2,8]]) s+=`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="${cream}" opacity=".78"/>`;
 }
 s+='</g>'+path(bell?'M-49 7 C-38 14-32 7-21 12 C-12 17-4 8 5 12 C13 14 18 6 28 9 C36 10 38 4 45 5':'M-65 4 C-48 13-42 8-28 11 C-15 13-6 6 7 9 C23 10 36 4 49 5 C59 5 65 2 68-1','none',cream,2.5)+'</g></g>';
 return s;
}
function fan(id,color,transform){
 const [light,mid,dark,ink,cream]=palettes[color];
 const d='M-8 81 C-13 45-35 31-62 19 C-77 13-81 5-72-3 C-80-15-67-26-52-24 C-48-39-33-43-19-36 C-6-52 13-48 21-37 C37-44 52-33 52-21 C70-22 79-9 70 2 C82 13 62 25 45 30 C22 37 15 60 10 80Z';
 let s=`<g transform="${transform}"><defs><linearGradient id="${id}-fan" x1="15%" y1="0%" x2="60%" y2="100%"><stop stop-color="${light}"/><stop offset=".35" stop-color="${mid}"/><stop offset=".75" stop-color="${dark}"/><stop offset="1" stop-color="${cream}"/></linearGradient><clipPath id="${id}-clip">${path(d,'white')}</clipPath></defs>`;
 s+=path(d,`url(#${id}-fan)`,ink,1.7)+`<g clip-path="url(#${id}-clip)">`;
 for(let i=-80;i<=80;i+=5){s+=path(`M1 82 Q${i*.22} 21 ${i} -35`,'none',cream,1.5,'opacity=".65"');s+=path(`M4 82 Q${i*.22+3} 21 ${i+2} -35`,'none',ink,.65,'opacity=".3"');}
 s+='</g>'+path('M-73-2 C-73-14-62-20-52-18 C-45-33-34-36-19-30 C-6-45 10-40 20-30 C34-37 47-27 47-17 C60-18 69-8 64 0','none',light,4)+path('M-4 76 C-3 51-9 37-18 22','none',cream,2)+'</g>';
 return s;
}
function moss(blue=false,young=false){
 const colors=blue?['#5d7d91','#88afbc','#c0d8d8']:['#677d78','#94aaa0','#ced3b9'];
 let s='<g id="root-moss">';
 for(let i=0;i<13;i++){const x=101+i*4.4,y=222+Math.sin(i*1.8)*3,r=3+(i%3);s+=`<path d="M${x} ${y+4}c-3-1-6-2-5-5c-4-2-3-6 0-6c-1-4 4-5 6-2c4-2 7 1 5 4c4 2 2 6-1 6c-1 3-4 4-5 3z" fill="${colors[i%3]}" stroke="${colors[0]}" stroke-width=".7"/>`;}
 return (young?`<g transform="translate(128 226) scale(.62) translate(-128 -226)">${s}</g></g>`:s+'</g>');
}
function artwork(shape,young){
 let body=extraArtwork(shape,young);
 if(shape==='round') body=young?mushroom('r','round','amber','translate(130 183) scale(.40)'):mushroom('r','round','amber','translate(123 118) rotate(-9) scale(1.02)')+mushroom('s','round','coral','translate(171 179) rotate(13) scale(.43)');
 if(shape==='cluster') body=young?mushroom('b1','bell','blue','translate(116 187) rotate(-12) scale(.35)')+mushroom('b2','bell','violet','translate(144 197) rotate(13) scale(.26)'):mushroom('b1','bell','blue','translate(121 111) rotate(-7) scale(1.02)')+mushroom('b2','bell','blue','translate(176 156) rotate(19) scale(.65)')+mushroom('b3','bell','violet','translate(84 178) rotate(-22) scale(.43)');
 if(shape==='fan') body=young?fan('f1','coral','translate(128 190) rotate(-10) scale(.44)'):fan('f1','coral','translate(117 119) rotate(-19) scale(1.0)')+fan('f2','violet','translate(169 166) rotate(29) scale(.64)')+fan('f3','amber','translate(104 182) rotate(-13) scale(.49)');
 return `<g id="mushrooms" stroke-linejoin="round">${body}</g>${moss(shape==='cluster',young)}`;
}
module.exports={artwork, shapes};
