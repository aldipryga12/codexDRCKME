import express from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import {spawn} from 'child_process';
const app=express();
const PORT=process.env.PORT||3000;
app.use(express.json({limit:'10kb'}));
app.use(express.static('public'));
app.get('/api/health',(_,res)=>res.json({ok:true}));
const upload=multer({dest:os.tmpdir(),limits:{fileSize:500*1024*1024}});
app.post('/api/process',upload.single('video'),(req,res)=>{
if(!req.file)return res.status(400).json({error:'Pilih video terlebih dahulu'});
const mode=String(req.body.mode||'hd');
const filters={
hd:['-vf','scale=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p','-preset','ultrafast','-crf','23'],
fps:['-vf',"scale='min(854,iw)':-2,minterpolate=fps=120:mi_mode=blend,format=yuv420p",'-preset','ultrafast','-crf','24'],
hdr:['-vf','eq=contrast=1.08:saturation=1.15,scale=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p','-preset','ultrafast','-crf','23']
};
const input=req.file.path,output=input+'.mp4';
const cleanup=()=>{fs.rm(input,{force:true},()=>{});fs.rm(output,{force:true},()=>{});};
if(!filters[mode]){cleanup();return res.status(400).json({error:'Mode tidak valid'});}
const args=['-hide_banner','-loglevel','error','-y','-i',input,...filters[mode],'-threads','1','-c:v','libx264','-c:a','aac','-b:a','192k','-movflags','+faststart',output];
const ff=spawn('ffmpeg',args);let err='',finished=false;const timeout=setTimeout(()=>{if(!finished){console.error('FFmpeg timeout',mode);ff.kill('SIGKILL');}},180000);console.log('Starting video conversion mode:',mode,'bytes:',req.file.size);
ff.stderr.on('data',d=>{err=(err+d.toString()).slice(-2500)});
ff.on('error',e=>{if(finished)return;finished=true;clearTimeout(timeout);cleanup();if(!res.headersSent)res.status(500).json({error:e.message})});
ff.on('close',code=>{if(finished)return;finished=true;clearTimeout(timeout);if(code!==0){console.error('FFmpeg failed:',code,err);cleanup();if(!res.headersSent)res.status(500).json({error:err||('FFmpeg berhenti (kode '+code+'). Server mungkin kehabisan memori atau melewati batas 3 menit. Coba video 5 detik.')});return;}res.download(output,'codex-repack-'+mode+'.mp4',cleanup)});
req.on('aborted',()=>{if(!finished)ff.kill('SIGTERM')});
});
app.listen(PORT,()=>console.log('Codex Repack on '+PORT));
