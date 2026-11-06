import {csvEscape,parseCsv} from './csv.js';

const fields=[['platform','平台'],['account','账号'],['author','联系人'],['content','私信内容'],['date','时间'],['status','状态'],['reply','回复草稿'],['sourceId','私信ID'],['notes','备注']];
const aliases={平台:'platform',platform:'platform',账号:'account',account:'account',联系人:'author',用户:'author',昵称:'author',作者:'author',author:'author',私信内容:'content',私信:'content',内容:'content',message:'content',content:'content',时间:'date',私信时间:'date',date:'date',状态:'status',status:'status',回复草稿:'reply',reply:'reply',私信id:'sourceId',messageid:'sourceId',sourceid:'sourceId',备注:'notes',notes:'notes'};
const statuses=new Set(['待处理','已回复','已忽略']);

export function messagesToCsv(items){return '\ufeff'+[fields.map(x=>x[1]),...items.map(item=>fields.map(([key])=>item[key]??''))].map(row=>row.map(csvEscape).join(',')).join('\r\n')}

export function csvToMessages(text,makeId){
 const rows=parseCsv(text);if(rows.length<2)throw Error('CSV 没有可导入的私信');if(rows.length>5001)throw Error('单次最多导入 5000 条私信');
 const keys=rows[0].map(x=>aliases[x.trim().toLowerCase()]||aliases[x.trim()]);if(!keys.includes('content'))throw Error('CSV 需要包含“私信内容”列');
 return rows.slice(1).map((row,i)=>{let item={id:makeId(),platform:'',account:'',author:'',content:'',date:'',status:'待处理',reply:'',sourceId:'',notes:''};for(let j=0;j<keys.length;j++)if(keys[j])item[keys[j]]=String(row[j]??'').trim();if(!item.content)throw Error(`第 ${i+2} 行缺少私信内容`);if(item.content.length>5000)throw Error(`第 ${i+2} 行私信超过 5000 字`);if(!item.status)item.status='待处理';if(!statuses.has(item.status))throw Error(`第 ${i+2} 行状态应为待处理、已回复或已忽略`);return item});
}

function key(item){return item.sourceId?JSON.stringify(['id',item.platform,item.account,item.sourceId]):JSON.stringify(['content',item.platform,item.account,item.author,item.content,item.date])}
export function mergeMessages(existing,incoming){const seen=new Set(existing.map(key)),added=[];let skipped=0;for(const item of incoming){const k=key(item);if(seen.has(k)){skipped++;continue}seen.add(k);added.push(item)}return {items:[...existing,...added],added:added.length,skipped}}
export function messageReplyPrompt(item){return `请针对这条私信起草一段友善、简短的中文回复。只提供可编辑的草稿，不要声称已经发送，不要编造事实或作出未经确认的承诺。\n平台：${item.platform||'未指定'}\n账号：${item.account||'未指定'}\n联系人：${item.author||'未指定'}\n私信：${item.content}`}
