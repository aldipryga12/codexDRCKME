import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import './style.css';
const $=id=>document.getElementById(id);
let mode='hd',engine=null,active=false,cancelled=false,urls=[];
function update(percent,stage,message){
 const value=Math.min(100,Math.max(0,Math.floor(percent)));
 $('progress').value=value;$('percent').textContent=value+'%';$('stage').textContent=stage;
 if(message!==undefined)$('status').textContent=message;
}
function lock(busy){$('quality').disabled=busy;active=busy;$('go').disabled=busy;$('cancel').disabled=!busy;$('files').disabled=busy;document.querySelectorAll('.mode').forEach(b=>b.disabled=busy);}
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;
 const details={hd:['Codex Repack HD','Encode video H.264 MP4 langsung di perangkat. Pilih kualitas output sesuai kemampuan perangkatmu.'],fps:['Codex Motion 120 FPS','Interpolasi gerakan eksperimental untuk membuat frame perantara. Sangat berat dan dapat gagal pada browser iPhone.'],hdr:['Codex HDR Look','Tingkatkan kontras, saturasi, dan gamma video. Ini efek SDR, bukan HDR10 asli.']};
 $('modeTitle').textContent=details[mode][0];$('modeDescription').textContent=details[mode][1];
}));
$('files').addEventListener('change',()=>{
 const files=[...$('files').files];
 $('fileList').textContent=files.length?files.map(f=>f.name+' ('+(f.size/1048576).toFixed(1)+' MB)').join(' · '):'Belum ada video dipilih.';\n $('videoInfo').hidden=!files.length;if(files.length)inspectVideo(files[0],$('videoInfo'));
});
function inspectVideo(file,target){
 if(!file){target.textContent='Belum ada video dipilih.';return;}
 const objectURL=URL.createObjectURL(file);
 const video=document.createElement('video');video.preload='metadata';video.muted=true;
 let finished=false;
 const finish=()=>{if(finished)return;finished=true;URL.revokeObjectURL(objectURL);video.removeAttribute('src');video.load();};
 video.onloadedmetadata=()=>{
  const duration=Number.isFinite(video.duration)?video.duration.toFixed(2)+' detik':'Tidak diketahui';
  const resolution=video.videoWidth&&video.videoHeight?video.videoWidth+' × '+video.videoHeight:'Tidak diketahui';
  const portrait=video.videoHeight>video.videoWidth;
  const ext=(file.name.split('.').pop()||'').toUpperCase();
  const ratio=portrait?'Vertikal':video.videoWidth>video.videoHeight?'Horizontal':'Persegi / tidak diketahui';
  target.replaceChildren();
  const title=document.createElement('strong');title.textContent='📋 INFORMASI VIDEO';target.appendChild(title);
  for(const [name,value] of [['Nama',file.name],['Format',ext||'Tidak diketahui'],['Ukuran',(file.size/1048576).toFixed(2)+' MB'],['Resolusi',resolution],['Orientasi',ratio],['Durasi',duration]]){
   const row=document.createElement('div');row.className='inspect-row';const key=document.createElement('span');key.textContent=name;const val=document.createElement('b');val.textContent=value;row.append(key,val);target.appendChild(row);
  }
  const note=document.createElement('p');note.textContent='Catatan: pemeriksaan browser tidak dapat memastikan FPS, codec, bitrate, atau apakah platform akan mempertahankan kualitas saat upload.';target.appendChild(note);finish();
 };
 video.onerror=()=>{target.textContent='Metadata video tidak dapat dibaca browser ini. Format mungkin tetap dapat diproses FFmpeg.';finish();};
 video.src=objectURL;
}
$('checkerFile').addEventListener('change',()=>inspectVideo($('checkerFile').files[0],$('checkerResult')));
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
  await ff.load({coreURL:await toBlobURL(coreBase+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(coreBase+'/ffmpeg-core.wasm','application/wasm')});
  engine=ff;return ff;
 }catch(e){ff.terminate();throw new Error('Gagal memuat FFmpeg. Periksa koneksi internet dan dukungan browser. '+(e?.message||String(e)||'Kesalahan tidak diketahui'));}
}
function argsFor(currentMode,input,output,quality){
 const common=['-threads','1','-i',input];
 const cap=quality===3840?3840:quality;
 const scale="scale=w='min("+cap+",iw)':h=-2:flags=bicubic";
 const vf={hd:scale+',format=yuv420p',fps:scale+',setpts=PTS-STARTPTS,minterpolate=fps=120:mi_mode=mci:mc_mode=obmc:me_mode=bidir:vsbmc=0,setpts=N/(120*TB),format=yuv420p',hdr:scale+',eq=contrast=1.06:brightness=0.008:saturation=1.12:gamma=1.02,format=yuv420p'};
 return [...common,'-vf',vf[currentMode],...(currentMode==='fps'?['-r','120','-fps_mode','cfr']:[]),'-c:v','libx264','-preset','ultrafast','-crf',quality<=640?'23':'21','-threads','1','-c:a','aac','-b:a','160k','-movflags','+faststart',output];
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
 const chosenMode=mode,chosenQuality=Number($('quality').value),fastMode=chosenMode==='hd'&&$('fastMode').checked;
 if(chosenMode==='fps'&&!confirm('120 FPS interpolasi gerakan sangat berat dan mungkin tidak didukung oleh FFmpeg browser. Uji video 2–3 detik pada kualitas Ringan dahulu. Lanjutkan?')){lock(false);return;}
 if(chosenQuality>=2560&&!fastMode&&!confirm('Resolusi tinggi di iPhone dapat menyebabkan browser kehabisan memori atau menutup halaman. Lanjutkan?')){lock(false);return;}
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
    let code;
    if(fastMode){
     update(0,'Mode cepat','Mencoba mengemas ulang video tanpa encoding. Resolusi dan FPS asli dipertahankan.');
     code=await ff.exec(['-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-movflags','+faststart',output],-1);
     if(code!==0){
      try{await ff.deleteFile(output)}catch{}
      update(0,'Fallback encode','Codec tidak cocok untuk remux. Menggunakan encoding standar yang lebih lambat.');
      code=await ff.exec(argsFor(chosenMode,input,output,chosenQuality),-1);
     }
    }else code=await ff.exec(argsFor(chosenMode,input,output,chosenQuality),-1);
    if(cancelled)break;
    if(code!==0)throw new Error(chosenMode==='fps'?'Interpolasi 120 FPS gagal (kode '+code+'). Mesin FFmpeg browser mungkin tidak mendukung minterpolate atau memori tidak cukup. Coba video 2–3 detik kualitas Ringan.':'FFmpeg gagal (kode '+code+'). Coba video lebih pendek atau mode Repack HD.');
    update(99,'Menyiapkan download','Membaca hasil video.');
    const data=await ff.readFile(output);
    const blob=new Blob([data],{type:'video/mp4'});
    const url=URL.createObjectURL(blob);urls.push(url);
    const a=document.createElement('a');a.href=url;a.download=file.name.replace(/\.[^.]+$/,'')+'-'+chosenMode+'-'+chosenQuality+'.mp4';a.textContent='⬇ Download '+a.download;
    $('downloads').appendChild(a);
    update(100,'Video selesai','Klik tombol Download di bawah untuk menyimpan hasil. ('+(i+1)+'/'+files.length+')');
   }finally{
    try{await ff.deleteFile(input)}catch{}
    try{await ff.deleteFile(output)}catch{}
   }
  }
 }catch(e){if(!cancelled){const message=e?.message||String(e);const memory=/out of bounds|memory|allocation|abort/i.test(message);update($('progress').value,'Proses gagal',memory?'Memori browser tidak cukup untuk video ini. Coba potong video menjadi 3–5 detik, pilih Repack HD, dan gunakan Safari langsung. Detail: '+message:message);if(engine){engine.terminate();engine=null;}}}
 finally{if(!cancelled)lock(false);}
});
