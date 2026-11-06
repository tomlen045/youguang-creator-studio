import test from 'node:test';
import assert from 'node:assert/strict';
import {isTerminalLocalTextTaskError,outputExtension,parseAiStoryboard,projectDuration,renderLocalVideo,shotMotionAt,splitScriptIntoShots,storyboardToSrt} from '../video-studio.js';
import {renderVideoStudio} from '../video-ui.js';

test('splitScriptIntoShots creates editable offline shot records and preserves script words',()=>{
 const script='大家好，今天分享本地视频制作。我们会用自己的素材，逐镜安排字幕和画面，并把视频完全留在本机完成导出。\n第一步整理素材。第二步检查字幕和声音。';
 const shots=splitScriptIntoShots(script);
 assert.ok(shots.length>=2);
 assert.equal(shots[0].title,'镜头 1');
 assert.ok(shots.every(shot=>shot.caption===shot.voiceover&&shot.duration>=3&&shot.duration<=12));
 const joined=shots.map(shot=>shot.voiceover).join('');
 for(const word of ['大家好','本地视频制作','自己的素材','逐镜安排字幕和画面','检查字幕和声音']) assert.ok(joined.includes(word));
});

test('splitScriptIntoShots handles blank and unusually long text without losing content',()=>{
 assert.deepEqual(splitScriptIntoShots('  \n  '),[]);
 const text='甲'.repeat(160);
 const shots=splitScriptIntoShots(text,{maxChars:40});
 assert.ok(shots.length>=3);
 assert.equal(shots.map(shot=>shot.voiceover).join(''),text);
});

test('projectDuration clamps shot durations to a safe range',()=>{
 assert.equal(projectDuration({shots:[{duration:3},{duration:0},{duration:90}]}),64);
});

test('shot motion stays bounded and moves over the shot duration',()=>{
 assert.deepEqual(shotMotionAt('zoom-in',0),{zoom:1,panX:0});
 assert.deepEqual(shotMotionAt('zoom-in',1),{zoom:1.1,panX:0});
 assert.ok(shotMotionAt('pan-left',0).panX>shotMotionAt('pan-left',1).panX);
 assert.deepEqual(shotMotionAt('unknown',.5),{zoom:1,panX:0});
});

test('parseAiStoryboard validates local model output and applies safe defaults',()=>{
 const shots=parseAiStoryboard('```json\n[{"title":"开场","voiceover":"今天讲一个技巧","visual":"桌面近景","duration":99,"motion":"zoom-in","transition":"fade"}]\n```');
 assert.equal(shots.length,1);
 assert.equal(shots[0].duration,60);
 assert.equal(shots[0].caption,'今天讲一个技巧');
 assert.equal(shots[0].motion,'zoom-in');
 assert.equal(shots[0].transition,'fade');
 assert.throws(()=>parseAiStoryboard('not json'),/JSON/);
 assert.throws(()=>parseAiStoryboard('[{}]'),/缺少口播/);
});

test('local AI task recovery clears terminal failures but keeps transient errors retryable',()=>{
 const failed=Object.assign(new Error('模型生成失败'),{terminal:true});
 const expired=Object.assign(new Error('任务不存在'),{status:410});
 const interrupted=Object.assign(new Error('连接超时'),{status:503});
 assert.equal(isTerminalLocalTextTaskError(failed),true);
 assert.equal(isTerminalLocalTextTaskError(expired),true);
 assert.equal(isTerminalLocalTextTaskError(interrupted),false);
});

test('video editor exposes motion and fades while escaping imported project identifiers',()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const id='project" onmouseover="alert(1)';
 const html=renderVideoStudio({projects:[{id,title:'离线测试',shots:[{id:'shot-1',duration:4,caption:'测试字幕'}]}],activeId:id,assets:[],drafts:[],esc,button:(label,action,primary=false)=>`<button class="btn ${primary?'primary':''}" data-action="${action}">${label}</button>`});
 assert.match(html,/缓慢推近/);
 assert.match(html,/黑场淡入淡出/);
 assert.match(html,/本机 AI 细化分镜/);
 assert.match(html,/data-project-id="project&quot; onmouseover=&quot;alert\(1\)"/);
 assert.doesNotMatch(html,/data-project-id="project" onmouseover=/);
});

test('video editor exposes a recoverable local AI task and disables duplicate submission',()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const button=(label,action,primary=false)=>`<button class="btn ${primary?'primary':''}" data-action="${action}">${label}</button>`;
 const project={id:'pending-project',title:'待恢复项目',shots:[]};
 const pending={provider:'comfyui',id:'task-1',projectId:project.id};
 const html=renderVideoStudio({projects:[project],activeId:project.id,aiPending:pending,assets:[],drafts:[],esc,button});
 assert.match(html,/恢复本机 AI 分镜/);
 assert.match(html,/data-project-id="pending-project"/);
 const busy=renderVideoStudio({projects:[project],activeId:project.id,aiPending:pending,aiBusy:true,assets:[],drafts:[],esc,button});
 assert.match(busy,/<button[^>]*disabled[^>]*>本机模型正在细化…/);
});

test('renderLocalVideo produces a local recording and reports frame progress',async()=>{
 const original=new Map();
 const replaceGlobal=(key,value)=>{original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})};
 let now=0,draws=0,stopped=false;
 const gradient={addColorStop(){}};
 const context={clearRect(){},createLinearGradient(){return gradient},fillRect(){},beginPath(){},arc(){},fill(){},fillText(){draws++},strokeText(){draws++},measureText(text){return {width:String(text).length}}};
 const stream={getTracks(){return [{stop(){stopped=true}}]},addTrack(){}};
 class Canvas{getContext(){return context}captureStream(){return stream}}
 class Recorder{static isTypeSupported(type){return type.startsWith('video/webm')}constructor(_stream,options){this.mimeType=options.mimeType;this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['offline video'])});this.onstop()}}
 try{
  replaceGlobal('HTMLCanvasElement',Canvas);
  replaceGlobal('MediaRecorder',Recorder);
  replaceGlobal('document',{createElement:()=>new Canvas()});
  replaceGlobal('performance',{now:()=>now});
  replaceGlobal('requestAnimationFrame',callback=>{now+=500;queueMicrotask(()=>callback(now))});
  const updates=[];
  const blob=await renderLocalVideo({title:'离线测试',aspectRatio:'1:1',resolution:720,shots:[{duration:1,caption:'离线字幕',transition:'fade',motion:'zoom-in'}]},{getAsset:async()=>null,onProgress:update=>updates.push(update)});
  assert.match(blob.type,/video\/webm/);
  assert.ok(blob.size>0);
  assert.ok(draws>0);
  assert.ok(updates.length>=1);
  assert.equal(stopped,true);
 }finally{
  for(const [key,descriptor] of original)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
});

test('storyboardToSrt uses cumulative shot timing and caption fallback',()=>{
 const srt=storyboardToSrt({shots:[
  {duration:3,caption:'第一镜字幕'},
  {duration:2,caption:'',voiceover:'第二镜对白'}
 ]});
 assert.equal(srt,'1\n00:00:00,000 --> 00:00:03,000\n第一镜字幕\n\n2\n00:00:03,000 --> 00:00:05,000\n第二镜对白\n');
});

test('outputExtension reflects the encoder output format',()=>{
 assert.equal(outputExtension(new Blob([], {type:'video/webm'})),'webm');
 assert.equal(outputExtension(new Blob([], {type:'video/mp4'})),'mp4');
});
