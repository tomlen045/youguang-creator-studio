export const COVER_TEMPLATES={
 neon:{name:'霓虹焦点',start:'#7b42ff',end:'#101631',align:'left',label:'CREATOR STUDIO'},
 minimal:{name:'简约留白',start:'#e6dfd2',end:'#a9a08f',align:'left',label:'CREATIVE NOTES'},
 bold:{name:'醒目标题',start:'#ff8640',end:'#42173b',align:'center',label:'TODAY’S STORY'},
 ocean:{name:'清新蓝调',start:'#2cbcae',end:'#153c70',align:'left',label:'INSPIRATION'},
};
export function wrapText(ctx,text,maxWidth){
 const result=[];for(const paragraph of String(text).split('\n')){let line='';for(const c of paragraph){if(line&&ctx.measureText(line+c).width>maxWidth){result.push(line);line=c}else line+=c}result.push(line)}return result;
}
export async function paintCover(canvas,config){
 const [width,height]=config.size.split('x').map(Number);canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,width,height);
 gradient.addColorStop(0,config.start);gradient.addColorStop(1,config.end);ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 if(config.imageUrl){
  const image=new Image();image.src=config.imageUrl;
  try{await image.decode();const scale=Math.max(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
   ctx.fillStyle=`rgba(5,8,25,${Number(config.overlay)/100})`;ctx.fillRect(0,0,width,height);
  }catch{throw Error('背景图片无法读取')}
 }else{ctx.fillStyle='rgba(255,255,255,.10)';ctx.beginPath();ctx.arc(width*.82,height*.17,width*.28,0,Math.PI*2);ctx.fill()}
 const light=config.template==='minimal'&&!config.imageUrl;ctx.fillStyle=light?'#1e2330':'#ffffff';
 const left=width*.08,maxWidth=width*.84,center=config.align==='center';ctx.textAlign=center?'center':'left';const x=center?width/2:left;
 ctx.font=`600 ${Math.round(width*.026)}px -apple-system, sans-serif`;ctx.globalAlpha=.8;ctx.fillText((config.label||'CREATOR STUDIO').slice(0,45),x,height*.1,maxWidth);ctx.globalAlpha=1;
 const size=Math.round(width*Number(config.fontScale)/100);ctx.font=`800 ${size}px -apple-system, "PingFang SC", sans-serif`;
 const lines=wrapText(ctx,config.title||'让好内容，被更多人看见',maxWidth).slice(0,8),lineHeight=size*1.24;
 const start=Math.max(height*.25,Math.min(height*.65-(lines.length-1)*lineHeight*.35,height*.82-lines.length*lineHeight));
 lines.forEach((line,i)=>ctx.fillText(line,x,start+i*lineHeight,maxWidth));
 if(config.subtitle){ctx.globalAlpha=.85;ctx.font=`500 ${Math.round(width*.032)}px -apple-system, sans-serif`;wrapText(ctx,config.subtitle,maxWidth).slice(0,2).forEach((line,i)=>ctx.fillText(line,x,Math.min(height*.88,start+lines.length*lineHeight+size*.45+i*size*.48),maxWidth));ctx.globalAlpha=1}
 ctx.globalAlpha=.7;ctx.font=`500 ${Math.round(width*.023)}px -apple-system, sans-serif`;ctx.fillText('MAKE SOMETHING MEANINGFUL',x,height*.95,maxWidth);ctx.globalAlpha=1;
}
