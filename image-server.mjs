import { randomUUID, randomInt } from 'node:crypto';
import { allowRequest } from './publish-server.mjs';
import {createImageJobStore} from './image-job-store.mjs';
import {fileURLToPath} from 'node:url';
const BASE='http://127.0.0.1:8188';
const MODELS=new Set(['v1-5-pruned-emaonly.safetensors','sd_xl_base_1.0.safetensors']);
const MAX_PROMPT=2000;
const request=(url,opts={})=>fetch(BASE+url,{...opts,signal:AbortSignal.timeout(opts.timeout||10000)});
async function bodyJson(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('请求过大');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export function buildImageGraph({model,prompt,negative='',width=512,height=768,steps=16,seed=randomInt(0,2147483647)}){
 if(!MODELS.has(model))throw Error('不支持该模型');
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>MAX_PROMPT)throw Error('请输入不超过 2000 字的画面描述');
 if(typeof negative!=='string'||negative.length>MAX_PROMPT)throw Error('反向描述过长');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<256||height<256||width>1024||height>1024||width%64||height%64)throw Error('画布尺寸应为 256–1024 且为 64 的倍数');
 if(!Number.isInteger(steps)||steps<2||steps>30||!Number.isSafeInteger(seed)||seed<0||seed>2147483647)throw Error('采样参数无效');
 return {
  '1':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:model}},
  '2':{class_type:'CLIPTextEncode',inputs:{text:prompt.trim(),clip:['1',1]}},
  '3':{class_type:'CLIPTextEncode',inputs:{text:negative,clip:['1',1]}},
  '4':{class_type:'EmptyLatentImage',inputs:{width,height,batch_size:1}},
  '5':{class_type:'KSampler',inputs:{model:['1',0],seed,steps,cfg:7,sampler_name:'euler',scheduler:'normal',positive:['2',0],negative:['3',0],latent_image:['4',0],denoise:1}},
  '6':{class_type:'VAEDecode',inputs:{samples:['5',0],vae:['1',2]}},
  '7':{class_type:'PreviewImage',inputs:{images:['6',0]}}
 };
}
export function imagePlugin(){
 const store=createImageJobStore(fileURLToPath(new URL('./runtime/image-jobs.json',import.meta.url)));const jobs=new Map(store.load().map(job=>[job.id,job]));let submitting=false;const persist=()=>{try{store.save(jobs.values());return true}catch{return false}};
 async function refresh(job){if(job.status!=='running')return;const response=await request('/history/'+encodeURIComponent(job.promptId));if(!response.ok)throw Error('无法查询图像任务');const record=(await response.json())[job.promptId];if(record?.status?.status_str==='error'){job.status='failed';job.error='生成失败，请检查图像服务状态和模型是否可用。'}else if(record?.outputs?.['7']?.images?.[0]){const image=record.outputs['7'].images[0];if(!/^[A-Za-z0-9_.-]+\.png$/i.test(image.filename||'')||image.type!=='temp'||image.subfolder)throw Error('图片返回格式无效');job.image=image;job.status='done'}if(job.status!=='running')persist()}
 const handler=async(req,res,next)=>{
  const path=req.url?.split('?')[0];if(!path?.startsWith('/api/creator/image/'))return next();
  res.setHeader('Cache-Control','no-store');
  const send=(status,obj)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(obj))};
  if(!allowRequest(req))return send(403,{error:'仅允许本机工作台发起请求'});
  if(req.method!=='POST')return send(405,{error:'不支持的请求'});
  try{
   const input=await bodyJson(req);
   let expired=false;for(const [id,job] of jobs)if(Date.now()-job.createdAt>=4*60*60*1000){jobs.delete(id);expired=true}if(expired)persist();
   if(path==='/api/creator/image/status'){
    const response=await request('/object_info/CheckpointLoaderSimple');if(!response.ok)throw Error('图像服务不可用');
    const j=await response.json();const available=j?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];if(!Array.isArray(available))throw Error('无法读取模型列表');
    return send(200,{models:available.filter(x=>MODELS.has(x))});
   }
   if(path==='/api/creator/image/generate'){
    const seed=input.seed==null||input.seed===''?randomInt(0,2147483647):Number(input.seed);
    const graph=buildImageGraph({...input,seed});
    const info=await request('/object_info/CheckpointLoaderSimple');if(!info.ok)throw Error('图像服务不可用');
    const available=(await info.json())?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]||[];if(!available.includes(input.model))throw Error('所选模型不可用');
    for(const job of jobs.values())if(job.status==='running')await refresh(job);
    if(submitting||[...jobs.values()].some(x=>x.status==='running'))throw Error('工作台已有图片正在生成，请等待完成');
    submitting=true;
    try{
     const reply=await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:randomUUID()})});
     const j=await reply.json();if(!reply.ok||!j.prompt_id)throw Error('图像服务未接受任务，请检查模型和服务状态');
     const id=randomUUID();jobs.set(id,{id,promptId:j.prompt_id,status:'running',seed,model:input.model,width:input.width,height:input.height,steps:input.steps,createdAt:Date.now()});
     const durable=persist();setTimeout(()=>{jobs.delete(id);persist()},4*60*60*1000).unref();return send(200,{id,status:'running',seed,durable});
    }finally{submitting=false}
   }
   if(path==='/api/creator/image/result'){
    const job=jobs.get(input.id);if(!job)throw Error('图片任务不存在或已过期');
    await refresh(job);
    return send(200,{id:job.id,status:job.status,error:job.error,seed:job.seed,model:job.model,width:job.width,height:job.height,steps:job.steps});
   }
   if(path==='/api/creator/image/file'){
    const job=jobs.get(input.id);if(!job||job.status!=='done'||!job.image||! /^[A-Za-z0-9_.-]+\.png$/i.test(job.image.filename||'')||job.image.type!=='temp'||job.image.subfolder)throw Error('图片尚未生成或记录无效');
    const query=new URLSearchParams({filename:job.image.filename,type:'temp',subfolder:''});const response=await request('/view?'+query.toString(),{timeout:30000});
    if(!response.ok)throw Error('无法读取生成图片');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20*1024*1024)throw Error('图片文件过大');res.statusCode=200;res.setHeader('Content-Type','image/png');return res.end(bytes);
   }
   return send(404,{error:'接口不存在'});
  }catch(err){return send(400,{error:err.name==='TimeoutError'?'连接本地图像服务超时':err.message||'图像服务不可用'})}
 };
 return {name:'creator-image',configureServer(s){s.middlewares.use(handler)},configurePreviewServer(s){s.middlewares.use(handler)}};
}
