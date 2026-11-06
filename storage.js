import { zip, unzip, strToU8, strFromU8 } from 'fflate';

const DB='creator-studio-files', STORE='files';
let connection;
function database(){
  if(!connection) connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('素材库被另一个页面占用，请关闭其他工作台页面后重试'));
  });
  return connection;
}
async function transaction(mode, run){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode), store=tx.objectStore(STORE);
    let value;
    try { value=run(store); } catch(e) { reject(e); return; }
    tx.oncomplete=()=>resolve(value?.result);
    tx.onerror=()=>reject(tx.error || new Error('素材存储失败'));
    tx.onabort=()=>reject(tx.error || new Error('素材存储已取消'));
  });
}
export const saveFile=(id,file)=>transaction('readwrite',s=>s.put(file,id));
export const getFile=id=>transaction('readonly',s=>s.get(id));
export const removeFile=id=>transaction('readwrite',s=>s.delete(id));
export async function replaceFiles(files){
  await transaction('readwrite',s=>{s.clear();for(const [id,blob] of files)s.put(blob,id)});
}
const zipAsync=files=>new Promise((resolve,reject)=>zip(files,{level:0},(e,v)=>e?reject(e):resolve(v)));
const unzipAsync=bytes=>new Promise((resolve,reject)=>unzip(bytes,(e,v)=>e?reject(e):resolve(v)));
export async function buildBackup(data){
  const files={'data.json':strToU8(JSON.stringify({version:2,exportedAt:new Date().toISOString(),data},null,2))};
  for(const a of data.assets){
    if(!a.fileId)continue;
    const blob=await getFile(a.fileId);
    if(!blob)throw new Error(`素材文件缺失：${a.title}`);
    files[`files/${a.fileId}`]=new Uint8Array(await blob.arrayBuffer());
  }
  return new Blob([await zipAsync(files)],{type:'application/zip'});
}
export async function readBackup(file){
  if(file.name.toLowerCase().endsWith('.json')) return {payload:JSON.parse(await file.text()),files:null};
  const archive=await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  if(!archive['data.json'])throw new Error('备份中没有数据文件');
  const payload=JSON.parse(strFromU8(archive['data.json']));
  const files=[];
  for(const a of payload?.data?.assets||[]){
    if(!a.fileId)continue;
    const bytes=archive[`files/${a.fileId}`];
    if(!bytes)throw new Error(`备份中缺少素材：${a.title}`);
    files.push([a.fileId,new Blob([bytes],{type:a.mime||'application/octet-stream'})]);
  }
  return {payload,files};
}
