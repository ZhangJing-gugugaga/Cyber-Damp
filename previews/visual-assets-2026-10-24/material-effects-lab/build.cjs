const fs=require('fs'),path=require('path'),data={};
for(const id of ['21','07'])data[id]='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../native-icon-reference/source-icons',id+'.png')).toString('base64');
fs.writeFileSync(path.join(__dirname,'extra-icons.js'),'Object.assign(ICON_DATA,'+JSON.stringify(data)+');');
