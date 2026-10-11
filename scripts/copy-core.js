import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const source=resolve('node_modules/@ffmpeg/core/dist/umd');
const destination=resolve('dist/ffmpeg');
await mkdir(destination,{recursive:true});
for(const name of ['ffmpeg-core.js','ffmpeg-core.wasm']){
 await copyFile(resolve(source,name),resolve(destination,name));
 console.log('Copied '+name+' to Netlify output');
}
