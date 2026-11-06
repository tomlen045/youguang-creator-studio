function port(value,fallback,name){if(value===undefined||value==='')return fallback;const n=Number(value);if(!/^\d+$/.test(value)||!Number.isInteger(n)||n<1024||n>65535)throw Error(`${name} 必须是 1024–65535 的端口号`);return n}
export const DEV_PORT=port(process.env.CREATOR_PORT,5194,'CREATOR_PORT');
export const PREVIEW_PORT=port(process.env.CREATOR_PREVIEW_PORT,4194,'CREATOR_PREVIEW_PORT');
if(DEV_PORT===PREVIEW_PORT)throw Error('工作台端口和预览端口不能相同');
