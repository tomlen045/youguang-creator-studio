import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {allowRequest} from './publish-server.mjs';
import {createImageJobStore} from './image-job-store.mjs';
const BASE='http://127.0.0.1:8188', MODEL='qwen_3_4b.safetensors';
const request=(path,options={})=>fetch(BASE+path,{...options,signal:AbortSignal.timeout(10000)});
async function bodyJson(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>50000)throw Error('请求过大');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export function buildTextGraph(prompt){
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000)throw Error('创作要求需为 1 至 12000 字');
 return {'1':{class_type:'CLIPLoader',inputs:{clip_name:MODEL,type:'ltxv',device:'default'}},'2':{class_type:'TextGenerate',inputs:{clip:['1',0],prompt:prompt.trim()+' /no_think',max_length:512,sampling_mode:'off',thinking:false,use_default_template:true}},'3':{class_type:'PreviewAny',inputs:{source:['2',0]}}};
}
export function textPlugin(){
 const store=createImageJobStore(fileURLToPath(new URL('./runtime/text-jobs.json',import.meta.url))), jobs=new Map(store.load().map(x=>[x.id,x]));let submitting=false;
 const persist=()=>{try{store.save([...jobs.values()].map(({id,promptId,status,createdAt,error})=>({id,promptId,status,createdAt,error})));return true}catch{return false}};
 async function status(){const [a,b,c]=await Promise.all(['/object_info/CLIPLoader','/object_info/TextGenerate','/object_info/PreviewAny'].map(x=>request(x)));if(!a.ok||!b.ok||!c.ok)throw Error('本地文字模型服务不可用');const j=await a.json(),models=j?.CLIPLoader?.input?.required?.clip_name?.[0]||[];return models.includes(MODEL)}
 async function refresh(job){if(job.status==='failed')return;let res=await request('/history/'+encodeURIComponent(job.promptId));if(!res.ok)throw Error('无法查询文字任务');let record=(await res.json())[job.promptId];if(record?.status?.status_str==='error'){job.status='failed';job.error='本地模型生成失败，请检查 ComfyUI 和模型状态。';persist();return}if(record?.outputs?.['3']){let t=record.outputs['3'].text;let value=Array.isArray(t)?t.join('\n').trim():'';if(!value){job.status='failed';job.error='本地模型未返回内容，请缩短要求后重试。'}else{job.status='done';job.text=value}persist()}}
 const handler=async(req,res,next)=>{let path=req.url?.split('?')[0];if(!path?.startsWith('/api/creator/text/'))return next();res.setHeader('Cache-Control','no-store');const send=(code,value)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value))};if(!allowRequest(req))return send(403,{error:'仅允许本机工作台发起请求'});if(req.method!=='POST')return send(405,{error:'不支持的请求'});
  try{let input=await bodyJson(req);
   let expired=false;for(const [id,job] of jobs)if(Date.now()-job.createdAt>=4*60*60*1000){jobs.delete(id);expired=true}if(expired)persist();
   if(path==='/api/creator/text/status')return send(200,{available:await status()});
   if(path==='/api/creator/text/generate'){
    const graph=buildTextGraph(input.prompt);if(!await status())throw Error('未找到本地 Qwen 模型');for(const job of jobs.values())if(job.status==='running')await refresh(job);if(submitting||[...jobs.values()].some(x=>x.status==='running'))throw Error('工作台已有文字任务，请等待完成');submitting=true;
    try{const response=await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:randomUUID()})});let result=await response.json();if(!response.ok||!result.prompt_id)throw Error('本地模型未接受任务');let id=randomUUID();jobs.set(id,{id,promptId:result.prompt_id,status:'running',createdAt:Date.now()});let durable=persist();setTimeout(()=>{jobs.delete(id);persist()},4*60*60*1000).unref();return send(200,{id,durable})}finally{submitting=false}
   }
   if(path==='/api/creator/text/result'){let job=jobs.get(input.id);if(!job)return send(410,{error:'文字任务不存在或已过期'});await refresh(job);return send(200,{status:job.status,text:job.text,error:job.error})}
   return send(404,{error:'接口不存在'});
  }catch(err){return send(400,{error:err.name==='TimeoutError'?'连接本地模型超时':err.message||'本地模型不可用'})}
 };
 return {name:'creator-text',configureServer(s){s.middlewares.use(handler)},configurePreviewServer(s){s.middlewares.use(handler)}};
}
