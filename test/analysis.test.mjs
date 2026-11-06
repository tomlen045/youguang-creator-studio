import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizePosts,summarizeIncome,calendarFile,upsertAudienceSnapshot} from '../analysis.js';
test('summaries use weighted interactions and totals per platform',()=>{
 const [x]=summarizePosts([{platform:'A',views:100,likes:5},{platform:'A',views:900,likes:95}]);
 assert.equal(x.views,1000);assert.equal(x.engagement,.1);assert.equal(x.count,2);
 assert.equal(summarizeIncome([{date:'2026-11-01',amount:100},{date:'2026-11-02',amount:30}])[0].total,130);
});
test('calendar all-day events use next day end and escape description',()=>{
 let text=calendarFile([{id:'1',title:'A,B',date:'2026-12-31',notes:'a\nb'}]);
 assert.match(text,/DTEND;VALUE=DATE:20270101/);assert.match(text,/SUMMARY:A\\,B/);assert.match(text,/a\\nb/);
});
test('timed calendar event uses the selected local time with a one-hour slot',()=>{
 let text=calendarFile([{id:'1',title:'发布',date:'2026-12-31',time:'23:30'}]);
 assert.match(text,/DTSTART:20261231T233000/);assert.match(text,/DTEND:20270101T003000/);
});
test('unrecorded metrics are distinct from recorded zero',()=>{
 const [row]=summarizePosts([{platform:'A',views:'',likes:''},{platform:'A',views:0}]);assert.equal(row.viewsCount,1);assert.equal(row.interactionsCount,0);assert.equal(row.views,0);
});
test('audience totals select the latest snapshot separately for each account',async()=>{
 const {latestAudienceSnapshots}=await import('../analysis.js');const rows=[{platform:'B站',sourceUid:'1',date:'2026-11-01',followers:2},{platform:'B站',sourceUid:'2',date:'2026-11-02',followers:3},{platform:'B站',sourceUid:'1',date:'2026-11-02',followers:4}];assert.equal(latestAudienceSnapshots(rows).reduce((n,x)=>n+x.followers,0),7);
});
test('Bilibili audience snapshots update by UID and date without losing other history',()=>{
 const old=[{id:'old',date:'2026-11-01',platform:'B站',sourceUid:'10',followers:6},{id:'other',date:'2026-11-02',platform:'B站',sourceUid:'20',followers:8}];
 const rows=upsertAudienceSnapshot(old,{date:'2026-11-02',platform:'B站',sourceUid:'10',followers:7,publicWorks:2},()=> 'new');
 assert.equal(rows.length,3);assert.deepEqual(rows.find(x=>x.sourceUid==='10'&&x.date==='2026-11-01'),old[0]);assert.equal(rows.find(x=>x.sourceUid==='10'&&x.date==='2026-11-02').followers,7);
 const refreshed=upsertAudienceSnapshot(rows,{date:'2026-11-02',platform:'B站',sourceUid:'10',followers:9,publicWorks:3},()=> 'unused');
 assert.equal(refreshed.length,3);assert.equal(refreshed.find(x=>x.sourceUid==='10'&&x.date==='2026-11-02').id,'new');assert.equal(refreshed.find(x=>x.sourceUid==='10'&&x.date==='2026-11-02').followers,9);
 assert.throws(()=>upsertAudienceSnapshot(rows,{date:'2026-02-30',platform:'B站',sourceUid:'10',followers:1},()=> 'x'),/日期无效/);
 assert.throws(()=>upsertAudienceSnapshot(rows,{date:'2026-11-02',platform:'B站',sourceUid:'10',followers:-1},()=> 'x'),/非负整数/);
});
