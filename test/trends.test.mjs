import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from '../trends-server.mjs';
test('maps Bilibili response and discards untrusted links',async()=>{
 const request=async()=>({ok:true,json:async()=>({code:0,data:{list:[{title:'示例',bvid:'BV123',owner:{name:'作者'},stat:{view:20}}]}})});
 assert.deepEqual(await loadSource('bilibili',request),[{source:'B站热门',title:'示例',url:'https://www.bilibili.com/video/BV123',author:'作者',views:20,description:''}]);
});
test('propagates platform failure and rejects unknown source',async()=>{
 await assert.rejects(()=>loadSource('bilibili',async()=>({ok:false,status:429})),/429/);
 await assert.rejects(()=>loadSource('other'),/未知来源/);
});
