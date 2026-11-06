import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createImageJobStore(path){
 function load(now=Date.now()){
  try{const parsed=JSON.parse(readFileSync(path,'utf8'));if(!Array.isArray(parsed))return [];
   return parsed.filter(x=>x&&UUID.test(x.id||'')&&UUID.test(x.promptId||'')&&['running','done','failed'].includes(x.status)&&Number.isFinite(x.createdAt)&&now-x.createdAt<4*60*60*1000&&now>=x.createdAt);
  }catch{return []}
 }
 function save(jobs){mkdirSync(dirname(path),{recursive:true});let tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify([...jobs]),{encoding:'utf8',mode:0o600});renameSync(tmp,path)}
 return {load,save};
}
