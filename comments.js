import {csvEscape,parseCsv} from './csv.js';
const fields=[['platform','平台'],['post','作品'],['author','作者'],['content','评论内容'],['date','时间'],['status','状态'],['reply','回复草稿'],['sourceId','评论ID'],['notes','备注']];
const aliases={平台:'platform',platform:'platform',作品:'post',作品标题:'post',post:'post',作者:'author',用户:'author',昵称:'author',author:'author',评论内容:'content',评论:'content',内容:'content',content:'content',时间:'date',评论时间:'date',date:'date',状态:'status',status:'status',回复草稿:'reply',reply:'reply',评论id:'sourceId',sourceid:'sourceId',备注:'notes',notes:'notes'};
const statuses=new Set(['待处理','已回复','已忽略']);
export function commentsToCsv(items){return '\ufeff'+[fields.map(x=>x[1]),...items.map(item=>fields.map(([key])=>item[key]??''))].map(row=>row.map(csvEscape).join(',')).join('\r\n')}
export function csvToComments(text,makeId){
 const rows=parseCsv(text);if(rows.length<2)throw Error('CSV 没有可导入的评论');if(rows.length>5001)throw Error('单次最多导入 5000 条评论');
 const keys=rows[0].map(x=>aliases[x.trim().toLowerCase()]||aliases[x.trim()]);if(!keys.includes('content'))throw Error('CSV 需要包含“评论内容”列');
 return rows.slice(1).map((row,i)=>{let item={id:makeId(),platform:'',post:'',author:'',content:'',date:'',status:'待处理',reply:'',sourceId:'',notes:''};for(let j=0;j<keys.length;j++)if(keys[j])item[keys[j]]=String(row[j]??'').trim();if(!item.content)throw Error(`第 ${i+2} 行缺少评论内容`);if(item.content.length>5000)throw Error(`第 ${i+2} 行评论超过 5000 字`);if(!item.status)item.status='待处理';if(!statuses.has(item.status))throw Error(`第 ${i+2} 行状态应为待处理、已回复或已忽略`);return item});
}
function key(item){return item.sourceId?JSON.stringify(['id',item.platform,item.sourceId]):JSON.stringify(['content',item.platform,item.post,item.author,item.content,item.date])}
export function mergeComments(existing,incoming){const seen=new Set(existing.map(key)),added=[];let skipped=0;for(const item of incoming){const k=key(item);if(seen.has(k)){skipped++;continue}seen.add(k);added.push(item)}return {items:[...existing,...added],added:added.length,skipped}}
export function commentReplyPrompt(item){return `请针对这条评论起草一段友善、简短的中文回复。不要假装已经回复，不要编造事实。\n平台：${item.platform||'未指定'}\n作品：${item.post||'未指定'}\n评论：${item.content}`}
