import {randomUUID} from 'node:crypto';
import {access, mkdir, readFile, rm, stat, writeFile, rename} from 'node:fs/promises';
import {createReadStream, createWriteStream, statSync, accessSync, constants} from 'node:fs';
import {join, resolve, extname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {allowRequest} from './publish-server.mjs';

const execFileAsync=promisify(execFile);
const APP_DIR=fileURLToPath(new URL('.',import.meta.url));
const STORE=join(APP_DIR,'runtime','musetalk-jobs.json');
const JOB_DIR=join(APP_DIR,'runtime','musetalk-jobs');
const VIDEO_EXTENSIONS=new Set(['.avi','.mp4','.mov','.flv','.mkv','.jpg','.jpeg','.png','.bmp','.tif','.tiff']);
const AUDIO_EXTENSIONS=new Set(['.wav','.mp3','.m4a','.aac','.ogg','.flac']);
const MAX_VIDEO=800*1024*1024;
const MAX_AUDIO=100*1024*1024;
const MAX_AGE=24*60*60*1000;

export function resolveMuseTalkHome({env=process.env,home=homedir(),appDir=APP_DIR}={}){
 const candidates=[env.MUSETALK_HOME,resolve(appDir,'../../musetalk-mac'),join(home,'musetalk-mac')].filter(Boolean);
 return candidates.find(path=>{try{return statSync(path).isDirectory()}catch{return false}})||null;
}

export function inspectMuseTalkFiles(home){
 if(!home)return [];
 const model=join(home,'upstream','models');
 const required=[
  ['MuseTalk 1.5 UNet',join(model,'musetalkV15','unet.pth'),1024*1024*1024],
  ['MuseTalk 1.5 配置',join(model,'musetalkV15','musetalk.json'),1],
  ['SD-VAE 权重',join(model,'sd-vae','diffusion_pytorch_model.bin'),100*1024*1024],
  ['SD-VAE 配置',join(model,'sd-vae','config.json'),1],
  ['Whisper Tiny 权重',join(model,'whisper','pytorch_model.bin'),50*1024*1024],
  ['Whisper Tiny 配置',join(model,'whisper','config.json'),1],
  ['Whisper 特征配置',join(model,'whisper','preprocessor_config.json'),1],
  ['人脸解析权重',join(model,'face-parse-bisent','79999_iter.pth'),10*1024*1024],
  ['YuNet CPU 人脸检测模型',join(model,'yunet','face_detection_yunet_2023mar.onnx'),200*1024],
  ['MuseTalk 推理代码',join(home,'upstream','scripts','inference.py'),1],
  ['Python 虚拟环境',join(home,'.venv','bin','python'),1],
 ];
 return required.map(([name,path,minSize])=>{
  try{const size=statSync(path).size;return {name,path,present:size>=minSize,size}}
  catch{return {name,path,present:false,size:0}}
 });
}

export function buildMuseTalkConfig({videoPath,audioPath,resultName,bboxShift=0}){
 if(typeof videoPath!=='string'||!videoPath||typeof audioPath!=='string'||!audioPath)throw Error('需要视频和音频文件');
 if(typeof resultName!=='string'||!/^[a-z0-9-]{1,80}\.mp4$/i.test(resultName))throw Error('输出文件名无效');
 const shift=Number(bboxShift);
 if(!Number.isInteger(shift)||shift < -30||shift > 30)throw Error('人脸裁切偏移应为 -30 到 30');
 return 'task_0:\n  video_path: '+JSON.stringify(videoPath)+'\n  audio_path: '+JSON.stringify(audioPath)+'\n  result_name: '+JSON.stringify(resultName)+'\n  bbox_shift: '+shift+'\n';
}

function cleanName(value){return basename(String(value||'文件').replace(/[\u0000-\u001f\u007f]/g,'').replace(/[\\/]/g,'_')).slice(0,160)||'文件'}
function jsonBody(req,limit=16384){return new Promise((resolveBody,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(Error('请求内容过大'));req.destroy();return}chunks.push(chunk)});req.on('end',()=>{try{resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('请求 JSON 格式无效'))}});req.on('error',reject)})}
function safeId(value){return /^[0-9a-f-]{36}$/i.test(String(value||''))}

async function loadJobs(){
 try{
  const jobs=JSON.parse(await readFile(STORE,'utf8'));
  return Array.isArray(jobs)?jobs.filter(job=>safeId(job.id)).map(job=>job.status==='running'||job.status==='created'?{...job,status:'interrupted',message:'工作台进程已重启；请重新提交本地口型任务。'}:job):[];
 }catch{return []}
}
async function saveJobs(jobs){
 await mkdir(join(APP_DIR,'runtime'),{recursive:true});
 const temp=STORE+'.'+process.pid+'.'+randomUUID()+'.tmp';
 const values=[...jobs.values()].map(({id,status,message,createdAt,updatedAt,videoName,audioName,resultName,log,error,outputBytes})=>({id,status,message,createdAt,updatedAt,videoName,audioName,resultName,log,error,outputBytes}));
 await writeFile(temp,JSON.stringify(values,null,2));
 await rename(temp,STORE);
}
function findExecutable(name){
 for(const dir of String(process.env.PATH||'').split(':')){if(!dir)continue;const path=join(dir,name);try{accessSync(path,constants.X_OK);return path}catch{}}
 return '';
}
async function checkRuntime(home,files){
 const missingFiles=files.filter(file=>!file.present);
 const ffmpeg=findExecutable('ffmpeg');
 const python=home&&join(home,'.venv','bin','python');
 let dependencies={checked:false,ready:false,missing:[],device:'未知',error:''};
 if(python&&missingFiles.length===0){
  const checkScript=[
   "import importlib.util,json",
   "names=['torch','torchvision','torchaudio','diffusers','accelerate','transformers','huggingface_hub','cv2','soundfile','librosa','einops','omegaconf']",
   "missing=[n for n in names if importlib.util.find_spec(n) is None]",
   "device='未知'",
   "if not missing:",
   " import cv2",
   " if not hasattr(cv2,'FaceDetectorYN'): missing.append('cv2.FaceDetectorYN')",
   " if not missing:",
   "  from musetalk.utils.preprocessing import _get_face_detector",
   "  _get_face_detector()",
   "  import torch",
   "  device='MPS' if torch.backends.mps.is_available() else ('CUDA' if torch.cuda.is_available() else 'CPU')",
   "print(json.dumps({'missing':missing,'device':device}))",
  ].join('\n');
  try{
   const result=await execFileAsync(python,['-c',checkScript],{cwd:join(home,'upstream'),timeout:20000,maxBuffer:1024*1024,env:{...process.env,PYTORCH_ENABLE_MPS_FALLBACK:'1'}});
   const parsed=JSON.parse(result.stdout.trim());
   dependencies={checked:true,ready:parsed.missing.length===0,missing:parsed.missing,device:parsed.device,error:''};
  }catch(error){
   dependencies={checked:true,ready:false,missing:[],device:'未知',error:String(error.stderr||error.message||'依赖检查失败').trim().slice(-1200)};
  }
 }
 const ready=Boolean(home&&missingFiles.length===0&&dependencies.ready&&ffmpeg);
 let reason='本机模型与推理环境已就绪。';
 if(!home)reason='未检测到 MuseTalk 本机项目目录。';
 else if(missingFiles.length)reason='缺少模型或文件：'+missingFiles.map(file=>file.name).join('、');
 else if(!dependencies.checked)reason='尚未检查 Python 环境。';
 else if(!dependencies.ready)reason='Python 环境缺少依赖：'+(dependencies.missing.join('、')||dependencies.error||'请检查虚拟环境');
 else if(!ffmpeg)reason='未找到 ffmpeg。';
 return {ready,home,reason,device:dependencies.device,dependencies,ffmpeg:Boolean(ffmpeg),files:files.map(({name,path,present,size})=>({name,path,present,size}))};
}

export async function getMuseTalkRuntimeStatus(options={}){
 const home=resolveMuseTalkHome(options);
 return checkRuntime(home,inspectMuseTalkFiles(home));
}

export function museTalkPlugin(){
 const jobs=new Map();
 let initialized=false;
 async function initialize(){
  if(initialized)return;
  initialized=true;
  await mkdir(JOB_DIR,{recursive:true});
  for(const saved of await loadJobs()){
   const home=resolveMuseTalkHome(),dir=join(JOB_DIR,saved.id);
   jobs.set(saved.id,{...saved,home,dir,outputPath:saved.status==='done'?join(dir,'results','v15',saved.resultName):undefined});
  }
  const cutoff=Date.now()-MAX_AGE;
  for(const [id,job] of jobs)if(job.createdAt<cutoff){jobs.delete(id);await rm(join(JOB_DIR,id),{recursive:true,force:true}).catch(()=>{})}
  await saveJobs(jobs).catch(()=>{});
 }
 function touch(job){job.updatedAt=Date.now();void saveJobs(jobs).catch(()=>{});return job}
 const handler=async(req,res,next)=>{
  const url=new URL(req.url||'/', 'http://127.0.0.1');
  const path=url.pathname;
  if(!path.startsWith('/api/creator/musetalk/'))return next();
  res.setHeader('Cache-Control','no-store');
  const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value))};
  if(!allowRequest(req))return send(403,{error:'仅允许本机工作台发起请求'});
  try{
   await initialize();
   const home=resolveMuseTalkHome(),files=inspectMuseTalkFiles(home);
   if(req.method==='POST'&&path==='/api/creator/musetalk/status')return send(200,await checkRuntime(home,files));
   if(req.method==='POST'&&path==='/api/creator/musetalk/jobs/list'){
    await jsonBody(req);
    const list=[...jobs.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,12).map(({id,status,message,createdAt,updatedAt,videoName,audioName,resultName,log,error,outputBytes})=>({id,status,message,createdAt,updatedAt,videoName,audioName,resultName,log,error,outputBytes}));
    return send(200,{jobs:list});
   }
   if(req.method==='POST'&&path==='/api/creator/musetalk/jobs'){
    if([...jobs.values()].some(job=>job.status==='running'))throw Error('已有 MuseTalk 任务在本机运行，请等待完成');
    const status=await checkRuntime(home,files);
    if(!status.ready)throw Error(status.reason);
    const input=await jsonBody(req);
    const videoName=cleanName(input.videoName),audioName=cleanName(input.audioName);
    const videoExt=extname(videoName).toLowerCase(),audioExt=extname(audioName).toLowerCase();
    if(!VIDEO_EXTENSIONS.has(videoExt)||!AUDIO_EXTENSIONS.has(audioExt))throw Error('视频支持 AVI、MP4、MOV、FLV、MKV；图片支持 JPG、PNG、BMP、TIF；音频支持 WAV、MP3、M4A、AAC、OGG、FLAC');
    const bboxShift=Number(input.bboxShift??0);
    if(!Number.isInteger(bboxShift)||bboxShift < -30||bboxShift > 30)throw Error('人脸裁切偏移应为 -30 到 30');
    const id=randomUUID(),dir=join(JOB_DIR,id);
    await mkdir(dir,{recursive:true});
    const job={id,status:'created',message:'正在准备本地输入文件。',createdAt:Date.now(),updatedAt:Date.now(),videoName,audioName,resultName:id+'.mp4',log:'',home,dir,bboxShift,videoPath:join(dir,'input-video'+videoExt),audioPath:join(dir,'input-audio'+audioExt)};
    jobs.set(id,job);await saveJobs(jobs);
    const cleanupTimer=setTimeout(()=>{jobs.delete(id);rm(dir,{recursive:true,force:true}).catch(()=>{});void saveJobs(jobs).catch(()=>{})},MAX_AGE);
    cleanupTimer.unref();
    return send(200,{id,status:job.status});
   }
   if(req.method==='POST'&&path==='/api/creator/musetalk/upload'){
    const id=url.searchParams.get('id'),kind=url.searchParams.get('kind'),job=jobs.get(id);
    if(!job||job.status!=='created')throw Error('本地口型任务不存在或已开始');
    if(!['video','audio'].includes(kind))throw Error('输入素材类型无效');
    const filePath=kind==='video'?job.videoPath:job.audioPath,limit=kind==='video'?MAX_VIDEO:MAX_AUDIO;
    let count=0;
    try{
     await pipeline(req,new Transform({transform(chunk,encoding,callback){count+=chunk.length;callback(count>limit?Error(kind==='video'?'视频文件不能超过 800 MB':'音频文件不能超过 100 MB'):null,chunk)}}),createWriteStream(filePath,{flags:'wx'}));
     if(count===0)throw Error('素材文件为空');
    }catch(error){await rm(filePath,{force:true}).catch(()=>{});throw error}
    if(kind==='video')job.videoBytes=count;else job.audioBytes=count;
    job.message=kind==='video'?'视频已载入本地任务。':'音频已载入本地任务。';
    touch(job);
    return send(200,{id,status:job.status,bytes:count});
   }
   if(req.method==='POST'&&path==='/api/creator/musetalk/run'){
    const input=await jsonBody(req),job=jobs.get(input.id);
    if(!job||job.status!=='created')throw Error('本地口型任务不存在或已启动');
    if(!job.videoBytes||!job.audioBytes)throw Error('请先完整载入视频和音频');
    const status=await checkRuntime(home,files);
    if(!status.ready)throw Error(status.reason);
    const resultDir=join(job.dir,'results');
    await mkdir(resultDir,{recursive:true});
    const configPath=join(job.dir,'inference.yaml');
    await writeFile(configPath,buildMuseTalkConfig({videoPath:job.videoPath,audioPath:job.audioPath,resultName:job.resultName,bboxShift:job.bboxShift}));
    job.status='running';job.message='MuseTalk 正在本机生成口型；大型模型首次运行可能需要数分钟。';job.log='';
    touch(job);
    const args=['-m','scripts.inference','--inference_config',configPath,'--result_dir',resultDir,'--unet_model_path',join(home,'upstream','models','musetalkV15','unet.pth'),'--unet_config',join(home,'upstream','models','musetalkV15','musetalk.json'),'--whisper_dir',join(home,'upstream','models','whisper'),'--version','v15','--batch_size','4','--bbox_shift',String(job.bboxShift)];
    const python=join(home,'.venv','bin','python');
    const child=spawn(python,args,{cwd:join(home,'upstream'),env:{...process.env,PYTORCH_ENABLE_MPS_FALLBACK:'1',GLOG_minloglevel:'2'},stdio:['ignore','pipe','pipe']});
    job.pid=child.pid;
    const append=chunk=>{job.log=(job.log+chunk.toString()).slice(-8000);job.updatedAt=Date.now()};
    child.stdout.on('data',append);child.stderr.on('data',append);
    child.on('error',error=>{job.status='failed';job.error=error.message;job.message='MuseTalk 本地推理未能启动。';touch(job)});
    child.on('close',async code=>{
     if(job.status!=='running')return;
     if(code===0){
      const output=join(resultDir,'v15',job.resultName);
      try{const info=await stat(output);if(!info.isFile()||info.size<1024)throw Error('没有生成有效 MP4');job.status='done';job.outputPath=output;job.outputBytes=info.size;job.message='口型同步已完成；可将结果保存到素材库。'}
      catch(error){job.status='failed';job.error=error.message;job.message='推理结束但没有找到有效成片，请检查任务日志。'}
     }else{job.status='failed';job.error='MuseTalk 退出代码 '+code;job.message='本地推理失败，请检查任务日志。'}
     touch(job);
    });
    return send(200,{id:job.id,status:job.status,message:job.message});
   }
   if(req.method==='POST'&&path==='/api/creator/musetalk/job'){
    const input=await jsonBody(req),job=jobs.get(input.id);
    if(!job)throw Error('口型同步任务不存在或已过期');
    return send(200,{id:job.id,status:job.status,message:job.message,error:job.error||'',log:job.log||'',videoName:job.videoName,audioName:job.audioName,resultBytes:job.outputBytes||0});
   }
   if(req.method==='POST'&&path==='/api/creator/musetalk/result'){
    const input=await jsonBody(req),job=jobs.get(input.id);
    if(!job||job.status!=='done'||!job.outputPath)throw Error('口型同步成片尚未就绪');
    await access(job.outputPath);
    res.statusCode=200;res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',String(job.outputBytes));res.setHeader('Content-Disposition','attachment; filename="musetalk-'+job.id+'.mp4"');
    return createReadStream(job.outputPath).pipe(res);
   }
   return send(404,{error:'接口不存在'});
  }catch(error){return send(400,{error:error.message||'MuseTalk 本地服务不可用'})}
 };
 return {
  name:'creator-musetalk',
  configureServer(server){server.middlewares.use(handler)},
  configurePreviewServer(server){server.middlewares.use(handler)}
 };
}
