const SOURCES={
 bilibili:{url:'https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1',name:'B站热门',headers:{Referer:'https://www.bilibili.com/','User-Agent':'Mozilla/5.0'}},
 v2ex:{url:'https://www.v2ex.com/api/topics/hot.json',name:'V2EX 热门',headers:{'User-Agent':'agent-reach/1.0'}}
};
export async function loadSource(key,request=fetch){
 const source=SOURCES[key];if(!source)throw Error('未知来源');
 const response=await request(source.url,{headers:source.headers,signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 const json=await response.json();let items;
 if(key==='bilibili'){
  if(json.code!==0||!Array.isArray(json.data?.list))throw Error(json.message||'平台返回异常');
  items=json.data.list.slice(0,20).map(x=>({source:source.name,title:String(x.title||''),url:`https://www.bilibili.com/video/${encodeURIComponent(x.bvid||'')}`,author:String(x.owner?.name||''),views:Number(x.stat?.view||0),description:String(x.desc||'').slice(0,500)}));
 }else{
  if(!Array.isArray(json))throw Error('平台返回格式异常');
  items=json.slice(0,20).map(x=>({source:source.name,title:String(x.title||''),url:`https://www.v2ex.com/t/${encodeURIComponent(String(x.id||''))}`,author:String(x.member?.username||''),views:0,description:String(x.content||'').slice(0,500)}));
 }
 return items.filter(x=>x.title);
}
export function trendsPlugin(){
 const handler=async(req,res,next)=>{
  if(req.url?.split('?')[0]!=='/api/creator/trends')return next();
  if(req.method!=='GET'){res.statusCode=405;return res.end()}
  const keys=Object.keys(SOURCES),results=await Promise.allSettled(keys.map(k=>loadSource(k)));
  const sources=results.map((r,i)=>r.status==='fulfilled'?{name:SOURCES[keys[i]].name,items:r.value}:{name:SOURCES[keys[i]].name,error:'连接失败或服务不可用',items:[]});
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({fetchedAt:new Date().toISOString(),sources}));
 };
 return {name:'creator-trends',configureServer(s){s.middlewares.use(handler)},configurePreviewServer(s){s.middlewares.use(handler)}};
}
