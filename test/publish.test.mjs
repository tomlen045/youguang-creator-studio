import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPublishArgs,allowRequest} from '../publish-server.mjs';
const valid={platform:'xiaohongshu',account:'creator_1',kind:'note',title:'标题',body:'正文',tags:'标签',schedule:''};
test('builds an argument array without shell interpolation',()=>{
 let args=buildPublishArgs({...valid,title:'$(touch hacked)'},['/tmp/a.png']);
 assert.ok(args.includes('--title=$(touch hacked)'));assert.ok(args.includes('/tmp/a.png'));
});
test('rejects unsupported platforms, accounts, formats and schedules',()=>{
 assert.throws(()=>buildPublishArgs({...valid,platform:'evil'},['/tmp/a.png']));
 assert.throws(()=>buildPublishArgs({...valid,account:'../../token'},['/tmp/a.png']));
 assert.throws(()=>buildPublishArgs(valid,['/tmp/a.mp4']));
 assert.throws(()=>buildPublishArgs({...valid,schedule:'tomorrow'},['/tmp/a.png']));
});
test('local endpoint requires matching local origin and custom header',()=>{
 assert.equal(allowRequest({headers:{host:'127.0.0.1:5194',origin:'http://127.0.0.1:5194','x-creator-request':'1'}}),true);
 assert.equal(allowRequest({headers:{host:'127.0.0.1:5194',origin:'https://attacker.example','x-creator-request':'1'}}),false);
 assert.equal(allowRequest({headers:{host:'evil.example:5194',origin:'http://evil.example:5194','x-creator-request':'1'}}),false);
});
test('platform specific restrictions and required Bilibili category',()=>{
 assert.throws(()=>buildPublishArgs({...valid,platform:'bilibili'},['/tmp/a.png']),/仅支持视频/);
 assert.throws(()=>buildPublishArgs({...valid,platform:'bilibili',kind:'video'},['/tmp/a.mp4']),/分区/);
 const args=buildPublishArgs({...valid,platform:'bilibili',kind:'video',tid:'171'},['/tmp/a.mp4']);
 assert.ok(args.includes('--tid=171'));assert.equal(args.includes('--headed'),false);
 assert.throws(()=>buildPublishArgs({...valid,platform:'kuaishou'},['/tmp/a.png']),/两张/);
});
test('an account cannot start two concurrent jobs', async()=>{
 const {createJobRegistry}=await import('../publish-server.mjs');const r=createJobRegistry();
 r.reserve('douyin:alice','one');assert.throws(()=>r.reserve('douyin:alice','two'),/正在进行/);
 r.release('douyin:alice','other');assert.equal(r.has('douyin:alice'),true);
 r.release('douyin:alice','one');r.reserve('douyin:alice','two');assert.equal(r.has('douyin:alice'),true);
});
