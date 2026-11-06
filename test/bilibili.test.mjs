import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBvid,validUid} from '../bilibili.js';
import {getVideoStats,getFollowerStats,getAccountStats} from '../bilibili-server.mjs';
test('accepts only Bilibili BV ids and matching public URLs',()=>{
 assert.equal(parseBvid('BV1M5xz64EFq'),'BV1M5xz64EFq');
 assert.equal(parseBvid('https://www.bilibili.com/video/BV1M5xz64EFq/?p=1'),'BV1M5xz64EFq');
 assert.equal(parseBvid('https://evil.example/video/BV1M5xz64EFq'),null);assert.equal(validUid('1234'),true);assert.equal(validUid('1e4'),false);
});
test('maps complete public video stats without inventing missing values',async()=>{
 const good=async()=>({ok:true,json:async()=>({code:0,data:{bvid:'BV1M5xz64EFq',title:'例子',pubdate:1700000000,stat:{view:100,like:10,reply:2,share:3}}})});
 let result=await getVideoStats('BV1M5xz64EFq',good);assert.equal(result.views,100);assert.equal(result.comments,2);
 const missing=async()=>({ok:true,json:async()=>({code:0,data:{bvid:'BV1M5xz64EFq',title:'x',stat:{view:10}}})});
 await assert.rejects(()=>getVideoStats('BV1M5xz64EFq',missing),/未返回完整/);
});
test('validates account response matches requested UID',async()=>{
 const req=async()=>({ok:true,json:async()=>({code:0,data:{mid:123,follower:45}})});
 assert.equal((await getFollowerStats('123',req)).followers,45);await assert.rejects(()=>getFollowerStats('999',req));
});
test('reads follower and public archive counts for the same Bilibili UID',async()=>{
 const req=async url=>({ok:true,json:async()=>String(url).includes('/x/relation/stat?')?{code:0,data:{mid:123,follower:45}}:{code:0,data:{page:{count:7},list:{vlist:[]}}}});
 const stats=await getAccountStats('123',req);assert.equal(stats.uid,'123');assert.equal(stats.followers,45);assert.equal(stats.publicWorks,7);assert.equal(stats.source,'B站公开数据');
 await assert.rejects(()=>getAccountStats('0',req),/有效的 B站数字 UID/);
});
test('daily snapshots update the same day without losing earlier history',async()=>{
 const {upsertDailySnapshot}=await import('../bilibili.js');const stats={syncedAt:'2026-11-02T04:00:00Z',views:100,likes:10,comments:2,shares:1};let history=upsertDailySnapshot([],stats);history=upsertDailySnapshot(history,{...stats,views:120});assert.equal(history.length,1);assert.equal(history[0].views,120);assert.throws(()=>upsertDailySnapshot(history,{...stats,views:-1}),/无效/);
});
