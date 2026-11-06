async function request(path,{method='POST',body=null,headers={}}={}){
 const isBlob=typeof Blob!=='undefined'&&body instanceof Blob;
 const response=await fetch(path,{method,headers:{'X-Creator-Request':'1',...(isBlob?{'Content-Type':body.type||'application/octet-stream'}:{'Content-Type':'application/json'}),...headers},body:isBlob?body:body===null?undefined:JSON.stringify(body)});
 if(!response.ok){let result={};try{result=await response.json()}catch{}throw Error(result.error||'MuseTalk 本地任务请求失败')}
 return response;
}
export async function getMuseTalkStatus(){return (await request('/api/creator/musetalk/status',{body:{}})).json()}
export async function listMuseTalkJobs(){return (await request('/api/creator/musetalk/jobs/list',{body:{}})).json()}
export async function createMuseTalkJob(input){return (await request('/api/creator/musetalk/jobs',{body:input})).json()}
export async function uploadMuseTalkFile(id,kind,file,fileName){
 const url='/api/creator/musetalk/upload?id='+encodeURIComponent(id)+'&kind='+encodeURIComponent(kind);
 return (await request(url,{body:file,headers:{'X-File-Name':encodeURIComponent(fileName||'asset.bin')}})).json();
}
export async function runMuseTalkJob(id){return (await request('/api/creator/musetalk/run',{body:{id}})).json()}
export async function getMuseTalkJob(id){return (await request('/api/creator/musetalk/job',{body:{id}})).json()}
export async function fetchMuseTalkResult(id){
 const response=await request('/api/creator/musetalk/result',{body:{id}});
 return response.blob();
}
