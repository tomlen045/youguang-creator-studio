import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,csvToPosts,postsToCsv} from '../csv.js';
test('CSV round trip keeps commas, quotes, multiline notes and counts',()=>{
 const posts=[{title:'测试,"标题"',date:'2026-11-02',platform:'小红书',views:1250,likes:30,comments:4,shares:2,review:'第一行\n第二行'}];
 const result=csvToPosts(postsToCsv(posts),()=> 'id');
 assert.deepEqual({...result[0],id:undefined},{...posts[0],id:undefined});
});
test('CSV rejects invalid rows and unclosed quotes',()=>{
 assert.throws(()=>csvToPosts('标题,阅读\n标题,坏数据',()=> 'id'));
 assert.throws(()=>parseCsv('标题\n"unfinished'));
});
test('CSV preserves an unrecorded count instead of inventing zero',()=>{const row=csvToPosts('标题,阅读,点赞\n作品,,0',()=> 'id')[0];assert.equal(row.views,'');assert.equal(row.likes,0);assert.equal(row.comments,'')});
test('audience CSV round trip validates dates and preserves blank interactions',async()=>{const {audienceToCsv,csvToAudience}=await import('../csv.js');const input=[{date:'2026-11-02',platform:'快手',followers:5,interactions:'',notes:'测试'}];assert.deepEqual(csvToAudience(audienceToCsv(input),()=> 'id')[0],{id:'id',...input[0]});assert.throws(()=>csvToAudience('日期,平台,粉丝数\n2026-02-31,快手,1',()=> 'id'),/日期无效/)});
test('audience CSV preserves account identities, B站 UID, and data source',async()=>{const {audienceToCsv,csvToAudience}=await import('../csv.js');const input=[{date:'2026-11-02',platform:'B站',sourceUid:'123',syncedAt:'2026-11-02T04:00:00Z',source:'公开空间手动核验',account:'主账号',followers:7,interactions:'',notes:''}];assert.deepEqual(csvToAudience(audienceToCsv(input),()=> 'id')[0],{id:'id',...input[0]})});
test('audience CSV preserves optional B站 public work counts',async()=>{const {audienceToCsv,csvToAudience}=await import('../csv.js');const input=[{date:'2026-11-02',platform:'B站',sourceUid:'123',followers:7,publicWorks:2,interactions:'',notes:''}];assert.deepEqual(csvToAudience(audienceToCsv(input),()=> 'id')[0],{id:'id',...input[0]})});
