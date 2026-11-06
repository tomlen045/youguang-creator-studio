import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commentsToCsv,csvToComments,mergeComments,commentReplyPrompt} from '../comments.js';
test('comment CSV round trips multiline text and metadata',()=>{const data=[{platform:'B站',post:'作品',author:'读者',content:'第一行，引用\n第二行',date:'2026-11-02',status:'待处理',reply:'谢谢',sourceId:'123',notes:'备注'}];assert.deepEqual(csvToComments(commentsToCsv(data),()=> 'id')[0],{id:'id',...data[0]})});
test('import validates all rows before merging and rejects unknown statuses',()=>{assert.throws(()=>csvToComments('平台,评论内容,状态\nB站,内容,已发送',()=> 'id'),/状态/);assert.throws(()=>csvToComments('平台,评论内容\nB站,',()=> 'id'),/缺少评论/)});
test('reimport skips duplicate IDs and comments without IDs',()=>{let a={platform:'B站',sourceId:'123',content:'内容'},b={platform:'B站',sourceId:'',author:'用户',content:'无编号',post:'作品',date:'今天'};let result=mergeComments([a,b],[{...a,content:'变更'},{...b},{platform:'B站',sourceId:'456',content:'新'}]);assert.equal(result.added,1);assert.equal(result.skipped,2);assert.equal(result.items[0].content,'内容')});
test('reply prompt makes explicit that it is only a draft',()=>assert.match(commentReplyPrompt({content:'怎么做？'}),/不要假装已经回复/));
