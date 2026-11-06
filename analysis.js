export const hasCount=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0;
export function summarizePosts(posts){
 const byPlatform=new Map();
 for(const p of posts){const name=p.platform||'未指定平台';let row=byPlatform.get(name)||{name,count:0,views:0,likes:0,comments:0,shares:0,viewsCount:0,interactionsCount:0};row.count++;for(const key of ['views','likes','comments','shares'])if(hasCount(p[key])){row[key]+=Number(p[key]);if(key==='views')row.viewsCount++;else row.interactionsCount++};byPlatform.set(name,row)}
 return [...byPlatform.values()].sort((a,b)=>b.views-a.views).map(row=>({...row,engagement:row.views?(row.likes+row.comments+row.shares)/row.views:0}));
}
export function summarizeIncome(items){
 const groups=new Map();for(const x of items){const month=/^\d{4}-\d{2}/.test(x.date||'')?x.date.slice(0,7):'未填写日期';let v=groups.get(month)||{month,total:0,count:0};v.total+=Number(x.amount)||0;v.count++;groups.set(month,v)}return [...groups.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
export function calendarFile(tasks){
 const esc=s=>String(s??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
 const valid=tasks.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date||''));
 const out=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Creator Studio//CN','CALSCALE:GREGORIAN'];
 for(const t of valid){const start=t.date.replaceAll('-',''),date=new Date(`${t.date}T00:00:00Z`);if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==t.date)continue;date.setUTCDate(date.getUTCDate()+1);const end=date.toISOString().slice(0,10).replaceAll('-','');const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.time||'')?t.time:null;let dates;if(time){let moment=new Date(`${t.date}T${time}:00Z`),finish=new Date(moment.getTime()+3600000);const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'');dates=[`DTSTART:${stamp(moment)}`,`DTEND:${stamp(finish)}`]}else dates=[`DTSTART;VALUE=DATE:${start}`,`DTEND;VALUE=DATE:${end}`];out.push('BEGIN:VEVENT',`UID:${esc(t.id)}@creator-studio`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}`,...dates,`SUMMARY:${esc(t.title)}`,`DESCRIPTION:${esc(`${t.platform||''} ${t.status||''}\n${t.notes||''}`)}`,'END:VEVENT')}
 return out.concat('END:VCALENDAR').join('\r\n')+'\r\n';
}
export function latestAudienceSnapshots(items){
 const latest=new Map();
 for(const snapshot of items){const key=JSON.stringify([snapshot.platform||'',snapshot.sourceUid||snapshot.account||'']);const old=latest.get(key);if(!old||(snapshot.date||'')>=(old.date||''))latest.set(key,snapshot)}
 return [...latest.values()];
}
export function upsertAudienceSnapshot(items,snapshot,makeId){
 const date=String(snapshot.date||'');
 const parsed=new Date(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('快照日期无效');
 if(!snapshot.platform)throw Error('快照平台不能为空');
 for(const key of ['followers','publicWorks','interactions']){
  const value=snapshot[key];
  if(value!==undefined&&value!==''&&value!==null&&(!Number.isSafeInteger(Number(value))||Number(value)<0))throw Error(`${key} 必须是非负整数`);
 }
 const identity=String(snapshot.sourceUid||snapshot.account||'');
 const same=(item)=>item.platform===snapshot.platform&&String(item.sourceUid||item.account||'')===identity&&item.date===date;
 const existing=items.find(same);
 const merged={...(existing||{}),...snapshot,id:existing?.id||snapshot.id||makeId()};
 return [...items.filter(item=>!same(item)),merged];
}
