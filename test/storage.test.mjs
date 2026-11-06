import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveFile,getFile,replaceFiles,buildBackup,readBackup} from '../storage.js';
const map=new Map();
globalThis.indexedDB={open(){
 const request={result:{createObjectStore(){},transaction(){
  const tx={error:null,objectStore(){return {
   put(value,key){map.set(key,value);return {}},get(key){return {result:map.get(key)}},delete(key){map.delete(key);return {}},clear(){map.clear()}
  }}};
  setImmediate(()=>tx.oncomplete?.());return tx;
 }}};
 setImmediate(()=>request.onsuccess?.());return request;
}};
test('full backup preserves file bytes and restores files',async()=>{
 await saveFile('asset-1',new Blob(['abc'],{type:'text/plain'}));
 let data={assets:[{id:'a',fileId:'asset-1',title:'one',mime:'text/plain'}],topics:[],comments:[{id:'c',content:'问题',reply:'回复草稿'}],coverDesign:{template:'neon',title:'保留封面设计',imageAssetId:'a'}};
 const archive=await buildBackup(data);const file=new File([archive],'backup.zip');const decoded=await readBackup(file);
 assert.equal(decoded.payload.data.comments[0].reply,'回复草稿');assert.equal(decoded.payload.version,2);assert.equal(decoded.payload.data.assets[0].title,'one');assert.deepEqual(decoded.payload.data.coverDesign,data.coverDesign);
 await replaceFiles(decoded.files);assert.equal(await (await getFile('asset-1')).text(),'abc');
});
test('backup fails clearly if referenced asset is missing',async()=>{
 await assert.rejects(()=>buildBackup({assets:[{fileId:'missing',title:'missing'}]}),/素材文件缺失/);
});
