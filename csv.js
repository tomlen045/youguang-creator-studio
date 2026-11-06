const FIELDS=[['title','标题'],['date','发布日期'],['platform','平台'],['views','阅读'],['likes','点赞'],['comments','评论'],['shares','分享'],['review','复盘']];
export function csvEscape(value){const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
export function postsToCsv(posts){return '\ufeff'+[FIELDS.map(x=>x[1]),...posts.map(p=>FIELDS.map(([key])=>p[key]??''))].map(row=>row.map(csvEscape).join(',')).join('\r\n')}
export function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false,justClosed=false;
 text=String(text).replace(/^\ufeff/,'');
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;justClosed=true}}else cell+=ch;continue}
  if(ch==='"'){if(cell||justClosed)throw Error('CSV 引号格式有误');quoted=true;continue}
  if(ch===','){row.push(cell);cell='';justClosed=false;continue}
  if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';justClosed=false;continue}
  if(justClosed&&!/\s/.test(ch))throw Error('CSV 引号后格式有误');
  if(!justClosed)cell+=ch;
 }
 if(quoted)throw Error('CSV 引号没有闭合');
 if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()))rows.push(row)}
 return rows;
}
export function csvToPosts(text,makeId){
 const rows=parseCsv(text);if(rows.length<2)throw Error('CSV 没有可导入的数据');
 const aliases={标题:'title',内容标题:'title',title:'title',发布日期:'date',日期:'date',date:'date',平台:'platform',platform:'platform',阅读:'views',阅读量:'views',播放量:'views',views:'views',点赞:'likes',点赞数:'likes',likes:'likes',评论:'comments',评论数:'comments',comments:'comments',分享:'shares',分享数:'shares',shares:'shares',复盘:'review',review:'review'};
 const fields=rows[0].map(h=>aliases[h.trim().toLowerCase()]||aliases[h.trim()]);
 if(!fields.includes('title'))throw Error('CSV 需要包含“标题”列');
 return rows.slice(1).map((r,i)=>{
  const obj={id:makeId(),title:'',date:'',platform:'',views:'',likes:'',comments:'',shares:'',review:''};
  fields.forEach((field,j)=>{if(field)obj[field]=(r[j]||'').trim()});
  if(!obj.title)throw Error(`第 ${i+2} 行缺少标题`);
  for(const key of ['views','likes','comments','shares']){const raw=String(obj[key]??'').replaceAll(',','');if(raw===''){obj[key]='';continue}if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error(`第 ${i+2} 行的${key}不是有效数字`);obj[key]=Number(raw)}
  if(obj.date&&!/^\d{4}-\d{2}-\d{2}$/.test(obj.date))throw Error(`第 ${i+2} 行日期需为 YYYY-MM-DD`);
  return obj;
 });
}
const AUDIENCE_FIELDS=[['date','日期'],['platform','平台'],['account','账号'],['sourceUid','B站UID'],['syncedAt','同步时间'],['source','数据来源'],['followers','粉丝数'],['publicWorks','公开作品数'],['interactions','互动量'],['notes','备注']];
export function audienceToCsv(items){return '\ufeff'+[AUDIENCE_FIELDS.map(x=>x[1]),...items.map(item=>AUDIENCE_FIELDS.map(([key])=>item[key]??''))].map(row=>row.map(csvEscape).join(',')).join('\r\n')}
export function csvToAudience(text,makeId){
 const rows=parseCsv(text);if(rows.length<2)throw Error('CSV 没有可导入的数据');
 const aliases={日期:'date',记录日期:'date',date:'date',平台:'platform',platform:'platform',账号:'account',account:'account',b站uid:'sourceUid',uid:'sourceUid',同步时间:'syncedAt',syncedat:'syncedAt',数据来源:'source',source:'source',粉丝数:'followers',followers:'followers',公开作品数:'publicWorks',作品数:'publicWorks',publicworks:'publicWorks',互动量:'interactions',interactions:'interactions',备注:'notes',notes:'notes'};
 const fields=rows[0].map(x=>aliases[x.trim().toLowerCase()]||aliases[x.trim()]);
 if(!['date','platform','followers'].every(x=>fields.includes(x)))throw Error('CSV 需要包含日期、平台和粉丝数列');
 return rows.slice(1).map((row,i)=>{let result={id:makeId(),date:'',platform:'',followers:'',interactions:'',notes:''};fields.forEach((key,j)=>{if(key)result[key]=String(row[j]??'').trim()});
  let date=new Date(result.date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==result.date)throw Error(`第 ${i+2} 行日期无效`);
  if(!result.platform)throw Error(`第 ${i+2} 行缺少平台`);
  if(result.sourceUid&&!/^[1-9]\d{0,15}$/.test(result.sourceUid))throw Error(`第 ${i+2} 行 B站 UID 无效`);if(result.syncedAt&&Number.isNaN(Date.parse(result.syncedAt)))throw Error(`第 ${i+2} 行同步时间无效`);for(const key of ['account','sourceUid','syncedAt','source'])if(!result[key])delete result[key];for(const key of ['followers','interactions','publicWorks']){const raw=result[key]===undefined?'':String(result[key]).replaceAll(',','');if(!raw&&key==='interactions')continue;if(!raw&&key==='publicWorks'){delete result[key];continue}if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error(`第 ${i+2} 行的${key}不是有效非负整数`);result[key]=Number(raw)}return result;
 });
}
