import {DEV_PORT,PREVIEW_PORT} from './port-config.mjs';
import {accessSync,constants} from 'node:fs';
import {delimiter} from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const platforms=new Set(['xiaohongshu','douyin','kuaishou','tencent','bilibili']);
const extensions=new Set(['.png','.jpg','.jpeg','.webp','.bmp','.mp4','.mov','.m4v','.webm']);
const MAX_BYTES=1024*1024*1024;
export function validateAccount(platform,account){
 if(!platforms.has(platform))throw Error('不支持的平台');
 if(typeof account!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(account))throw Error('账号标识只能包含字母、数字、下划线和连字符');
}
export function buildPublishArgs(input,paths){
 validateAccount(input.platform,input.account);
 if(!['note','video'].includes(input.kind))throw Error('请选择图文或视频');
 if(['tencent','bilibili'].includes(input.platform)&&input.kind!=='video')throw Error('该平台当前仅支持视频');
 if(input.platform==='bilibili'&&(!/^\d{1,8}$/.test(String(input.tid||''))||!input.body?.trim()))throw Error('B站视频需要填写简介和数字分区 ID');
 if(input.platform==='kuaishou'&&input.kind==='note'&&paths.length<2)throw Error('快手图文需要至少两张不同图片');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw Error('标题需为 1 至 100 个字符');
 if(typeof input.body!=='string'||input.body.length>10000)throw Error('正文过长');
 if(typeof input.tags!=='string'||input.tags.length>500)throw Error('标签过长');
 if(input.schedule&&!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input.schedule))throw Error('定时格式应为 YYYY-MM-DD HH:mm');
 if(!Array.isArray(paths)||!paths.length||paths.length>35||(input.kind==='video'&&paths.length!==1))throw Error('图文需要 1–35 张图片，视频需要一个文件');
 for(const path of paths){const ext=extname(path).toLowerCase();if(input.kind==='note'&&!['.jpg','.jpeg','.png','.webp','.bmp'].includes(ext))throw Error('图文仅支持图片');if(input.kind==='video'&&!['.mp4','.mov','.m4v','.webm'].includes(ext))throw Error('视频格式不受支持')}
 const args=[input.platform,input.kind==='note'?'upload-note':'upload-video','--account',input.account];
 if(input.kind==='note')args.push('--images',...paths);else args.push('--file',paths[0]);
 args.push(`--title=${input.title.trim()}`);
 if(input.body)args.push(`${input.kind==='note'?'--note':'--desc'}=${input.body}`);
 if(input.platform==='bilibili')args.push(`--tid=${input.tid}`);
 if(input.tags)args.push(`--tags=${input.tags}`);
 if(input.schedule)args.push(`--schedule=${input.schedule}`);
 if(input.platform!=='bilibili')args.push('--headed');return args;
}
export function allowRequest(req){
 const host=String(req.headers.host||''),origin=String(req.headers.origin||'');
 return [DEV_PORT,PREVIEW_PORT].some(port=>['127.0.0.1','localhost'].some(name=>host===`${name}:${port}`))&&origin===`http://${host}`&&req.headers['x-creator-request']==='1';
}
export function findSau({env=process.env,home=homedir(),platform=process.platform}={}){
 const exe=platform==='win32'?'sau.exe':'sau';
 const candidates=[env.CREATOR_SAU_PATH,...String(env.PATH||'').split(delimiter).filter(Boolean).map(dir=>join(dir,exe)),join(home,'.local','bin',exe)].filter(Boolean);
 for(const path of candidates){try{accessSync(path,platform==='win32'?constants.F_OK:constants.X_OK);return path}catch{}}
 return null;
}
async function jsonBody(req){let length=0,chunks=[];for await(const c of req){length+=c.length;if(length>65536)throw Error('请求内容过大');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export function createJobRegistry(){const active=new Map();return {reserve(key,id){if(active.has(key))throw Error('该账号已有任务正在进行，请等待完成');active.set(key,id)},release(key,id){if(active.get(key)===id)active.delete(key)},has(key){return active.has(key)}}}
export function publishPlugin(){
 const staged=new Map(),jobs=new Map(),active=createJobRegistry();
 function clean(id){const entry=staged.get(id);if(entry){staged.delete(id);clearTimeout(entry.timer);rm(entry.dir,{recursive:true,force:true}).catch(()=>{})}}
 function startJob(args,type,fileIds=[],key){
  const id=randomUUID();active.reserve(key,id);const job={id,type,status:'running',message:'已启动，请查看打开的浏览器窗口。'};jobs.set(id,job);
  const executable=findSau();
  if(!executable){job.status='failed';job.message='未找到发布工具 sau。请先按使用说明安装并将它加入 PATH。';active.release(key,id);fileIds.forEach(clean);return job}
  let stdout='';let child;
  try{child=spawn(executable,args,{stdio:['ignore','pipe','pipe'],env:process.env});}catch{job.status='failed';job.message='无法启动发布工具';active.release(key,id);fileIds.forEach(clean);return job}
  child.stdout.on('data',chunk=>{if(type==='check')stdout=(stdout+chunk.toString()).slice(-4000)});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{active.release(key,id);job.status='failed';job.message='无法启动发布工具，请检查本机安装。';fileIds.forEach(clean)});
  child.on('close',code=>{
   active.release(key,id);if(job.status==='failed')return;
   if(type==='check'){const invalid=/\binvalid\b/i.test(stdout),valid=/\bvalid\b/i.test(stdout);job.status=code===0&&valid&&!invalid?'success':'failed';job.message=job.status==='success'?'账号状态有效':'账号未登录或校验失败，请重新登录。'}
   else{job.status=code===0?'success':'failed';job.message=code===0?(type==='login'?'登录流程已完成，请校验账号。':'发布工具报告完成，请到平台确认结果。'):(type==='login'?'登录未完成，请查看平台浏览器窗口并重试。':'发布失败或未完成，请检查登录状态、平台规则和素材。')}
   fileIds.forEach(clean);setTimeout(()=>jobs.delete(id),60*60*1000).unref();
  });return job;
 }
 const handler=async(req,res,next)=>{
  const path=req.url?.split('?')[0];if(!path?.startsWith('/api/creator/publish/'))return next();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const send=(status,obj)=>{res.statusCode=status;res.end(JSON.stringify(obj))};
  if(!allowRequest(req))return send(403,{error:'仅允许本机工作台发起请求'});
  try{
   if(req.method==='POST'&&path==='/api/creator/publish/dependencies')return send(200,{available:!!findSau()});
   if(req.method==='POST'&&path==='/api/creator/publish/stage'){
    const ext=extname(decodeURIComponent(String(req.headers['x-file-name']||''))).toLowerCase();if(!extensions.has(ext))throw Error('不支持的素材格式');
    const size=Number(req.headers['content-length']||0);if(size>MAX_BYTES)throw Error('单个文件不能超过 1 GB');
    const dir=await mkdtemp(join(tmpdir(),'creator-publish-')),id=randomUUID(),file=join(dir,`asset${ext}`);let count=0,hash=createHash('sha256');
    try{await pipeline(req,new Transform({transform(chunk,enc,cb){count+=chunk.length;hash.update(chunk);cb(count>MAX_BYTES?Error('单个文件不能超过 1 GB'):null,chunk)}}),createWriteStream(file,{flags:'wx'}));if(!count)throw Error('文件为空')}
    catch(err){await rm(dir,{recursive:true,force:true});throw err}
    const timer=setTimeout(()=>clean(id),2*60*60*1000);timer.unref();staged.set(id,{dir,file,timer,digest:hash.digest('hex')});return send(200,{id});
   }
   if(req.method==='POST'&&path==='/api/creator/publish/action'){
    const input=await jsonBody(req);validateAccount(input.platform,input.account);const accountKey=`${input.platform}:${input.account}`;if(active.has(accountKey))throw Error('该账号已有任务正在进行，请等待完成');
    if(input.action==='login'&&input.platform==='bilibili')throw Error('B站登录需在本机终端执行 sau bilibili login --account '+input.account);
    if(input.action==='login'||input.action==='check')return send(200,startJob([input.platform,input.action,'--account',input.account,...(input.action==='login'?['--headed']:[])],input.action,[],accountKey));
    if(input.action!=='publish')throw Error('不支持的操作');
    if(!Array.isArray(input.files)||new Set(input.files).size!==input.files.length)throw Error('素材无效');
    const entries=input.files.map(id=>staged.get(id));if(entries.some(x=>!x||x.inUse))throw Error('素材已过期或正在使用，请重新选择');
    if(input.platform==='kuaishou'&&input.kind==='note'&&new Set(entries.map(x=>x.digest)).size!==entries.length)throw Error('快手图文需要内容不同的图片');
    const args=buildPublishArgs(input,entries.map(x=>x.file));entries.forEach(x=>{x.inUse=true});return send(200,startJob(args,'publish',input.files,accountKey));
   }
   if(req.method==='POST'&&path==='/api/creator/publish/status'){
    const input=await jsonBody(req),job=jobs.get(input.id);return job?send(200,job):send(404,{error:'任务不存在或已过期'});
   }
   return send(404,{error:'接口不存在'});
  }catch(err){return send(400,{error:err.message||'操作失败'})}
 };
 return {name:'creator-publish',configureServer(s){s.middlewares.use(handler)},configurePreviewServer(s){s.middlewares.use(handler)}};
}
