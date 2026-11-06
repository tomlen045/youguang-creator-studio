import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildMuseTalkConfig,inspectMuseTalkFiles,resolveMuseTalkHome} from '../musetalk-server.mjs';
import {renderMuseTalkPanel} from '../musetalk-ui.js';

test('MuseTalk config safely quotes local file paths and validates crop offset',()=>{
 const yaml=buildMuseTalkConfig({videoPath:'/tmp/my video.mp4',audioPath:'/tmp/voice "take".wav',resultName:'output-123.mp4',bboxShift:-4});
 assert.ok(yaml.includes('video_path: '+JSON.stringify('/tmp/my video.mp4')));
 assert.ok(yaml.includes('audio_path: '+JSON.stringify('/tmp/voice "take".wav')));
 assert.match(yaml,/bbox_shift: -4/);
 assert.throws(()=>buildMuseTalkConfig({videoPath:'x',audioPath:'y',resultName:'../out.mp4'}),/文件名/);
 assert.throws(()=>buildMuseTalkConfig({videoPath:'x',audioPath:'y',resultName:'out.mp4',bboxShift:31}),/偏移/);
});

test('MuseTalk home can be pointed at the local project and missing weights stay explicit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creator-musetalk-test-'));
 try{
  const found=resolveMuseTalkHome({env:{MUSETALK_HOME:dir},home:dir,appDir:dir});
  assert.equal(found,dir);
  const files=inspectMuseTalkFiles(dir);
  assert.equal(files.length,11);
  assert.ok(files.every(file=>file.present===false));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('MuseTalk panel requires ready local models and usable imported media',()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const button=(label,action)=>'<button data-action="'+action+'">'+label+'</button>';
 const assets=[{id:'v1',type:'视频',fileId:'v1',title:'人物视频',fileName:'person.mp4'},{id:'a1',type:'音频',fileId:'a1',title:'配音',fileName:'voice.wav'}];
 const blocked=renderMuseTalkPanel({status:{ready:false,reason:'缺少 PyTorch'},jobs:[],assets,esc,button});
 assert.match(blocked,/MuseTalk 1.5 离线口型同步/);
 assert.match(blocked,/缺少 PyTorch/);
 assert.match(blocked,/data-action="musetalk-run" disabled/);
 const ready=renderMuseTalkPanel({status:{ready:true,reason:'就绪',home:'/fixtures/local-models/musetalk',device:'MPS'},jobs:[{id:'job-1',status:'done',message:'完成',videoName:'人物视频'}],assets,esc,button});
 assert.match(ready,/data-action="musetalk-run"/);
 assert.doesNotMatch(ready,/data-action="musetalk-run" disabled/);
 assert.match(ready,/YuNet、Whisper Tiny、SD-VAE 与 MuseTalk/);
 assert.match(ready,/推理在本机完成；设备由本机环境自动选择/);
 assert.doesNotMatch(ready,/\/fixtures\/local-models\/musetalk|推理设备：MPS/);
 assert.match(ready,/保存成片到素材库/);
});
