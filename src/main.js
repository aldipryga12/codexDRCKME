import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import './style.css';
const $=id=>document.getElementById(id);
let mode='hd',engine=null,active=false,cancelled=false,urls=[];
function update(percent,stage,message){
 const value=Math.min(100,Math.max(0,Math.floor(percent)));
 $('progress').value=value;$('percent').textContent=value+'%';$('stage').textContent=stage;
 if(message!==undefined)$('status').textContent=message;
}
function lock(busy){active=busy;$('go').disabled=busy;$('cancel').disabled=!busy;$('files').disabled=busy;document.querySelectorAll('.mode').forEach(b=>b.disabled=busy);}
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;
}));
$('files').addEventListener('change',()=>{
 const files=[...$('files').files];
 $('fileList').textContent=files.length?files.map(f=>f.name+' ('+(f.size/1048576).toFixed(1)+' MB)').join(' · '):'Belum ada video dipilih.';
});
async function loadEngine(){
 if(engine)return engine;
 update(0,'Memuat mesin video','Mengunduh FFmpeg WebAssembly. Pertama kali dapat memerlukan waktu.');
 const ff=new FFmpeg();
 const coreBase='/ffmpeg';
 ff.on('progress',({progress})=>{
  if(!active||!Number.isFinite(progress))return;
  const pct=Math.max(0,Math.min(99,Math.round(progress*100)));
  update(pct,'Memproses video','FFmpeg sedang mengonversi video di perangkat ini.');
 });
 try{
  await ff.load({coreURL:coreBase+'/ffmpeg-core.js',wasmURL:coreBase+'/ffmpeg-core.wasm'});
  engine=ff;return ff;
 }catch(e){ff.terminate();throw new Error('Gagal memuat FFmpeg. Periksa koneksi internet dan dukungan browser. '+(e?.message||String(e)||'Kesalahan tidak diketahui'));}
}
function argsFor(currentMode,input,output){
 const common=['-i',input,'-threads','1'];
 const vf={
  hd:'scale=trunc(min(1280,iw)/2)*2:-2,format=yuv420p',
  fps:"scale='min(640,iw)':-2,fps=120,format=yuv420p",
  hdr:'scale=trunc(min(1280,iw)/2)*2:-2,eq=contrast=1.08:saturation=1.15,format=yuv420p'
 };
 return [...common,'-vf',vf[currentMode],'-c:v','libx264','-preset','ultrafast','-crf','26','-c:a','aac','-b:a','128k','-movflags','+faststart',output];
}
$('cancel').addEventListener('click',()=>{
 if(!active)return;cancelled=true;if(engine){engine.terminate();engine=null;}
 update(0,'Dibatalkan','Proses dihentikan. Kamu bisa mencoba lagi.');
 lock(false);
});
$('go').addEventListener('click',async()=>{
 if(active)return;
 const files=[...$('files').files];if(!files.length){update(0,'Belum ada video','Pilih file video terlebih dahulu.');return;}
 if(files.some(f=>f.size>150*1048576)){update(0,'File terlalu besar','Batas 150 MB per file. Di iPhone disarankan di bawah 30 MB.');return;}
 cancelled=false;lock(true);
 for(const url of urls)URL.revokeObjectURL(url);urls=[];$('downloads').replaceChildren();
 const chosenMode=mode;
 try{
  const ff=await loadEngine();
  for(let i=0;i<files.length;i++){
   if(cancelled)break;
   const file=files[i],input='input_'+i+'.'+(file.name.split('.').pop()||'mp4').replace(/[^a-z0-9]/gi,'').slice(0,6),output='output_'+i+'.mp4';
   update(0,'Menyiapkan video',(i+1)+'/'+files.length+': '+file.name);
   try{
    await ff.writeFile(input,await fetchFile(file));
    if(cancelled)break;
    update(0,'Memproses video',(i+1)+'/'+files.length+': '+file.name);
    const code=await ff.exec(argsFor(chosenMode,input,output),-1);
    if(cancelled)break;
    if(code!==0)throw new Error('FFmpeg gagal (kode '+code+'). Coba video lebih pendek atau mode Repack HD.');
    update(99,'Menyiapkan download','Membaca hasil video.');
    const data=await ff.readFile(output);
    const blob=new Blob([data],{type:'video/mp4'});
    const url=URL.createObjectURL(blob);urls.push(url);
    const a=document.createElement('a');a.href=url;a.download=file.name.replace(/\.[^.]+$/,'')+'-'+chosenMode+'.mp4';a.textContent='⬇ Download '+a.download;
    $('downloads').appendChild(a);
    update(100,'Video selesai','Klik tombol Download di bawah untuk menyimpan hasil. ('+(i+1)+'/'+files.length+')');
   }finally{
    try{await ff.deleteFile(input)}catch{}
    try{await ff.deleteFile(output)}catch{}
   }
  }
 }catch(e){if(!cancelled)update($('progress').value,'Proses gagal',e.message||String(e));}
 finally{if(!cancelled)lock(false);}
});
