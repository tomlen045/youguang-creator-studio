import {allowRequest} from './publish-server.mjs';
import {parseBvid,validUid} from './bilibili.js';
const HEADERS={'User-Agent':'Mozilla/5.0',Referer:'https://www.bilibili.com/'};
async function query(path,request=fetch){let r=await request('https://api.bilibili.com'+path,{headers:HEADERS,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`B站接口不可用（HTTP ${r.status}）`);let j=await r.json();if(j.code!==0||!j.data)throw Error('B站未返回公开数据，可能需要稍后重试或平台限制访问');return j.data}
function count(value){return Number.isSafeInteger(value)&&value>=0?value:null}
export async function getVideoStats(bvid,request=fetch){
 if(parseBvid(bvid)!==bvid)throw Error('请输入有效的 B站 BV 号');let data=await query('/x/web-interface/view?bvid='+encodeURIComponent(bvid),request);
 let stat=data.stat||{},values={views:count(stat.view),likes:count(stat.like),comments:count(stat.reply),shares:count(stat.share)};
 if(Object.values(values).some(x=>x===null))throw Error('B站未返回完整公开统计，未更新现有数据');
 if(data.bvid!==bvid||typeof data.title!=='string')throw Error('B站返回的作品信息不匹配');
 let published=Number(data.pubdate);let date=Number.isFinite(published)&&published>0?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(published*1000)):'';
 return {bvid,title:data.title.slice(0,300),date,platform:'B站',url:`https://www.bilibili.com/video/${bvid}`,author:String(data.owner?.name||'').slice(0,120),...values,syncedAt:new Date().toISOString(),source:'B站公开数据'};
}
export async function getFollowerStats(uid,request=fetch){
 if(!validUid(uid))throw Error('请输入有效的 B站数字 UID');let data=await query('/x/relation/stat?vmid='+encodeURIComponent(uid),request);
 let followers=count(data.follower);if(followers===null||String(data.mid)!==String(uid))throw Error('B站未返回有效的公开粉丝数');
 return {uid:String(uid),followers,syncedAt:new Date().toISOString(),source:'B站公开数据'};
}
export async function getAccountStats(uid,request=fetch){
 if(!validUid(uid))throw Error('请输入有效的 B站数字 UID');
 let [relation,archive]=await Promise.all([
  query('/x/relation/stat?vmid='+encodeURIComponent(uid),request),
  query('/x/space/arc/search?mid='+encodeURIComponent(uid)+'&pn=1&ps=1&order=pubdate',request)
 ]);
 let followers=count(relation.follower),publicWorks=count(archive.page?.count);
 if(followers===null||String(relation.mid)!==String(uid))throw Error('B站未返回有效的公开粉丝数');
 if(publicWorks===null)throw Error('B站未返回有效的公开投稿数');
 return {uid:String(uid),followers,publicWorks,syncedAt:new Date().toISOString(),source:'B站公开数据'};
}
export function bilibiliPlugin(){
 const handler=async(req,res,next)=>{let path=req.url?.split('?')[0];if(!path?.startsWith('/api/creator/bilibili/'))return next();res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');const send=(status,obj)=>{res.statusCode=status;res.end(JSON.stringify(obj))};
 if(!allowRequest(req))return send(403,{error:'仅允许本机工作台发起请求'});if(req.method!=='POST')return send(405,{error:'不支持的请求'});
 try{let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>8192)throw Error('请求过大');chunks.push(c)}let input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(path==='/api/creator/bilibili/video')return send(200,await getVideoStats(input.bvid));if(path==='/api/creator/bilibili/followers')return send(200,await getFollowerStats(input.uid));if(path==='/api/creator/bilibili/account')return send(200,await getAccountStats(input.uid));return send(404,{error:'接口不存在'})}catch(err){let message=err.name==='TimeoutError'?'连接 B站超时，请稍后重试':/HTTP 412/.test(err.message)?'B站暂时限制自动查询（HTTP 412），请在已登录空间核验后手动记录公开数据':err.message||'同步失败';return send(400,{error:message})}
 };return {name:'creator-bilibili',configureServer(s){s.middlewares.use(handler)},configurePreviewServer(s){s.middlewares.use(handler)}};
}
