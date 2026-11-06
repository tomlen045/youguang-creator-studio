export function parseBvid(input){
 const text=String(input||'').trim();if(/^BV[A-Za-z0-9]{10}$/i.test(text))return 'BV'+text.slice(2);
 try{const url=new URL(text);if(!['https:','http:'].includes(url.protocol)||!['www.bilibili.com','m.bilibili.com','bilibili.com'].includes(url.hostname))return null;const m=url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})(?:\/|$)/i);return m?'BV'+m[1].slice(2):null}catch{return null}
}
export function validUid(value){return /^[1-9][0-9]{0,15}$/.test(String(value||''))&&Number.isSafeInteger(Number(value))}
export function upsertDailySnapshot(history,stats){
 const instant=new Date(stats.syncedAt);if(Number.isNaN(instant.getTime()))throw Error('同步时间无效');
 const date=instant.toLocaleDateString('sv-SE'),snapshot={date,syncedAt:stats.syncedAt};
 for(const key of ['views','likes','comments','shares']){let value=stats[key];if(!Number.isSafeInteger(value)||value<0)throw Error('统计数据无效');snapshot[key]=value}
 return [...(Array.isArray(history)?history:[]).filter(x=>x.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)).slice(-365);
}
