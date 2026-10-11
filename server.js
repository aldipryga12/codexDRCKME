import express from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import {spawn} from 'child_process';
const app=express();
const PORT=process.env.PORT||3000;
const jobs=new Map();
app.use(express.static('public'));
app.get('/api/health',(_,res)=>res.json({ok:true}));
const upload=multer({dest:os.tmpdir(),limits:{fileSize:150*1024*1024}});
const remove=p=>fs.rm(p,{force:true},()=>{});
function probe(path){
 return new Promise((resolve,reject)=>{
  const p=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path]);
  let data='';p.stdout.on('data',d=>data+=d);p.on('error',reject);
  p.on('close',code=>{const n=Number(data.trim());if(code===0&&Number.isFinite(n)&&n>0)resolve(n);else reject(new Error('Durasi video tidak dapat dibaca'));});
 });
}
app.post('/api/jobs',upload.single('video'),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'Pilih video'});
 const mode=String(req.body.mode||'hd');
 if(!['hd','fps','hdr'].includes(mode)){remove(req.file.path);return res.status(400).json({error:'Mode tidak dikenal'});}
 let duration;
 try{duration=await probe(req.file.path);}catch(e){remove(req.file.path);return res.status(400).json({error:e.message});}
 if([...jobs.values()].some(j=>j.state==='processing')){remove(req.file.path);return res.status(429).json({error:'Server sedang memproses video lain. Coba lagi setelah selesai.'});}
 const id=crypto.randomUUID(),input=req.file.path,output=input+'.mp4';
 const job={state:'processing',percent:0,mode,input,output,error:null,created:Date.now(),duration};
 jobs.set(id,job);
 res.json({id});
 const vf={
  hd:'scale=trunc(min(1280,iw)/2)*2:-2,format=yuv420p',
  fps:"scale='min(640,iw)':-2,fps=120,format=yuv420p",
  hdr:'scale=trunc(min(1280,iw)/2)*2:-2,eq=contrast=1.08:saturation=1.15,format=yuv420p'
 };
 const args=['-hide_banner','-loglevel','error','-nostdin','-progress','pipe:1','-y','-i',input,'-vf',vf[mode],'-threads','1','-c:v','libx264','-preset','ultrafast','-crf','25','-c:a','aac','-b:a','128k','-movflags','+faststart',output];
 const ff=spawn('ffmpeg',args);
 let stderr='',buffer='',finished=false,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;ff.kill('SIGKILL')},180000);
 ff.stdout.on('data',chunk=>{
  buffer+=chunk.toString();
  const lines=buffer.split('\n');buffer=lines.pop()||'';
  for(const line of lines){
   const match=line.trim().match(/^out_time_(?:us|ms)=(\d+)$/);
   if(match){const sec=Number(match[1])/1000000;job.percent=Math.max(job.percent,Math.min(99,Math.floor(sec/duration*100)));}
  }
 });
 ff.stderr.on('data',d=>stderr=(stderr+d.toString()).slice(-1200));
 const finish=(ok,error)=>{if(finished)return;finished=true;clearTimeout(timer);remove(input);if(ok){job.state='done';job.percent=100;}else{job.state='error';job.error=error||'FFmpeg gagal';remove(output);}setTimeout(()=>{remove(output);jobs.delete(id)},15*60*1000).unref();};
 ff.on('error',e=>finish(false,e.message));
 ff.on('close',code=>finish(code===0,timedOut?'Proses melebihi 3 menit. Coba video lebih pendek atau hosting lebih kuat.':stderr||'FFmpeg berhenti dengan kode '+code));
});
app.get('/api/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'Pekerjaan tidak ditemukan'});res.json({state:j.state,percent:j.percent,error:j.error});});
app.get('/api/jobs/:id/download',(req,res)=>{const j=jobs.get(req.params.id);if(!j||j.state!=='done')return res.status(404).json({error:'Hasil belum tersedia'});res.download(j.output,'codex-repack-'+j.mode+'.mp4');});
app.listen(PORT,()=>console.log('Codex Repack listening on '+PORT));
