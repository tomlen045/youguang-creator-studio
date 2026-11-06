import {findSau} from './publish-server.mjs';
import {DEV_PORT,PREVIEW_PORT} from './port-config.mjs';
async function json(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});return r.ok?await r.json():null}catch{return null}}
console.log(`Node ${process.version}；工作台端口 ${DEV_PORT}，预览端口 ${PREVIEW_PORT}（均为固定端口，冲突时不自动切换）`);
console.log(`发布工具 sau：${findSau()?'已找到':'未找到，请参照 README 安装'}`);
const [ckpt,clip,text,ollama]=await Promise.all([
 json('http://127.0.0.1:8188/object_info/CheckpointLoaderSimple'),
 json('http://127.0.0.1:8188/object_info/CLIPLoader'),
 json('http://127.0.0.1:8188/object_info/TextGenerate'),
 json('http://127.0.0.1:11434/api/tags')]);
if(!ckpt)console.log('ComfyUI：未连接（生成图片及 ComfyUI 文案需要运行本地服务）');
else{const models=ckpt.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]||[];console.log('图像模型：'+(['v1-5-pruned-emaonly.safetensors','sd_xl_base_1.0.safetensors'].filter(x=>models.includes(x)).join('、')||'尚未找到支持的模型'));const clips=clip?.CLIPLoader?.input?.required?.clip_name?.[0]||[];console.log('ComfyUI Qwen 文案模型：'+(text?.TextGenerate&&clips.includes('qwen_3_4b.safetensors')?'可用':'未找到或缺少节点'))}
console.log('Ollama：'+(ollama?'已连接；模型 '+((ollama.models||[]).map(x=>x.name).join('、')||'无'):'未连接（可选）'));
console.log('联网热点、B站数据及账号发布需要网络；不同平台账号需自行登录。');
