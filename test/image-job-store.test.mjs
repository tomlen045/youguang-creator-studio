import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createImageJobStore} from '../image-job-store.mjs';
test('image jobs survive a service restart and expired jobs are ignored',()=>{
 const dir=mkdtempSync(join(tmpdir(),'creator-job-test-'));try{
  const path=join(dir,'jobs.json'),now=Date.now(),job={id:'11111111-1111-4111-8111-111111111111',promptId:'22222222-2222-4222-8222-222222222222',status:'running',createdAt:now};
  createImageJobStore(path).save([job]);assert.deepEqual(createImageJobStore(path).load(now),[job]);assert.deepEqual(createImageJobStore(path).load(now+5*3600000),[]);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
