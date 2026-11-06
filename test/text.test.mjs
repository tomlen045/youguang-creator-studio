import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTextGraph} from '../text-server.mjs';
test('local text graph is limited to the installed Qwen model and disables thinking',()=>{const graph=buildTextGraph('写一个标题');assert.equal(graph['1'].inputs.clip_name,'qwen_3_4b.safetensors');assert.equal(graph['2'].inputs.prompt,'写一个标题 /no_think');assert.deepEqual(graph['3'].inputs.source,['2',0]);assert.equal(graph['2'].inputs.thinking,false)});
test('local text graph rejects empty or excessive prompts',()=>{assert.throws(()=>buildTextGraph('  '));assert.throws(()=>buildTextGraph('x'.repeat(12001)));assert.throws(()=>buildTextGraph({}));});
