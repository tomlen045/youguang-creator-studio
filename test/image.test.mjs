import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildImageGraph} from '../image-server.mjs';
const input={model:'v1-5-pruned-emaonly.safetensors',prompt:'A quiet desk',width:512,height:768,steps:16,seed:42};
test('workflow uses only approved core nodes and a preview output',()=>{
 const g=buildImageGraph(input);assert.equal(g['1'].inputs.ckpt_name,input.model);assert.equal(g['5'].inputs.seed,42);assert.equal(g['7'].class_type,'PreviewImage');assert.deepEqual(g['6'].inputs.samples,['5',0]);
});
test('rejects arbitrary models, paths, dimensions and sampling values',()=>{
 for(const patch of [{model:'../../secret'},{width:999},{steps:200},{seed:-1},{prompt:''}])assert.throws(()=>buildImageGraph({...input,...patch}));
});
