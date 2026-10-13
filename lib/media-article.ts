import type { Speech } from './discussion';
import type { ResearchItem } from './research';
export type Quote = { messageId: string; speaker: string; text: string };
export type MediaArticle = {
  version: 1; sessionId: string; title: string; alternatives: string[]; dek: string; thesis: string; lead: string;
  sections: { heading: string; paragraphs: string[]; messageIds: string[]; sourceIndexes: number[] }[];
  counterargument: string; watchList: string[]; quotes: Quote[]; sources: ResearchItem[];
  transcriptHash: string; generatedAt: string; model: string;
};
export type ArticleState = { status: 'pending'|'generating'|'waiting'|'ready'; article: MediaArticle|null; error: string|null; retryAt: number; attempts: number };
export function quotePool(history: Speech[]): Quote[] {
  return history.filter(x=>x.speaker!=='host').flatMap(x=>x.body.split(/(?<=[。！？])/u)
    .filter(text=>text.length>=22&&text.length<=95).slice(0,2).map(text=>({messageId:x.id,speaker:x.speaker,text}))).slice(0,30);
}
const clean=(x:unknown,max:number)=>typeof x==='string'?x.trim().slice(0,max):'';
export function validateArticle(raw:Record<string,unknown>,history:Speech[],sources:ResearchItem[]) {
  const title=clean(raw.title,80),dek=clean(raw.dek,180),thesis=clean(raw.thesis,200),lead=clean(raw.lead,700);
  const alternatives=Array.isArray(raw.alternatives)?raw.alternatives.map(x=>clean(x,80)).filter(Boolean).slice(0,3):[];
  if(title.length<8||dek.length<20||thesis.length<20||lead.length<80||alternatives.length<2)throw new Error('文章主判断或标题结构不完整');
  if(!Array.isArray(raw.sections)||raw.sections.length<3||raw.sections.length>5)throw new Error('文章章节不完整');
  const known=new Set(history.map(x=>x.id));
  const sections=raw.sections.map(value=>{
    const s=value as Record<string,unknown>;
    const heading=clean(s.heading,70),paragraphs=Array.isArray(s.paragraphs)?s.paragraphs.map(x=>clean(x,900)).filter(Boolean).slice(0,5):[];
    const messageIds=Array.isArray(s.messageIds)?s.messageIds.map(x=>String(x)):[];
    const sourceIndexes=Array.isArray(s.sourceIndexes)?s.sourceIndexes as number[]:[];
    if(!heading||paragraphs.join('').length<130||!messageIds.length||messageIds.some(id=>!known.has(id)))throw new Error('文章无法回溯本场发言');
    if(sourceIndexes.some(i=>!Number.isInteger(i)||!sources[i]||sources[i].access==='title-only'))throw new Error('文章使用了不存在或仅有标题的证据');
    return {heading,paragraphs,messageIds:[...new Set(messageIds)],sourceIndexes:[...new Set(sourceIndexes)]};
  });
  const counterargument=clean(raw.counterargument,800),watchList=Array.isArray(raw.watchList)?raw.watchList.map(x=>clean(x,230)).filter(Boolean).slice(0,5):[];
  if(counterargument.length<80||watchList.length<2)throw new Error('文章缺少反方观点或验证条件');
  const body=lead+sections.flatMap(x=>x.paragraphs).join('')+counterargument;
  if(body.length<900)throw new Error('文章尚未展开完整论证');
  if(!sections.some(x=>x.sourceIndexes.length))throw new Error('文章未引用已读取来源');
  const evidence=sources.filter(x=>x.access!=='title-only').map(x=>x.title+x.excerpt).join(' ');
  const quantities=[...(title+dek+body).matchAll(/\d+(?:\.\d+)?(?:万亿|亿元|万元|亿|万|%|％|个百分点|倍)/g)].map(x=>x[0]);
  if(quantities.some(q=>!evidence.includes(q)))throw new Error('文章存在来源未支持的定量断言');
  const pool=quotePool(history);
  const quotes=(Array.isArray(raw.quoteIndexes)?raw.quoteIndexes:[]).filter((i):i is number=>typeof i==='number'&&Number.isInteger(i)&&Boolean(pool[i])).slice(0,3).map(i=>pool[i]);
  return {title,alternatives,dek,thesis,lead,sections,counterargument,watchList,quotes};
}
export function articleMarkdown(article:MediaArticle) {
  return `# ${article.title}\n\n${article.dek}\n\n> AI沙龙观察 · ${article.generatedAt.slice(0,10)}\n> 思想代理讨论经AI编辑整理，不代表经济学家本人发言。来源摘录与推演观点需要分别理解。\n\n${article.lead}\n\n`+
    article.sections.map(s=>`## ${s.heading}\n\n${s.paragraphs.join('\n\n')}\n\n依据：${s.sourceIndexes.map(i=>`[${article.sources[i].publisher}](${article.sources[i].url})`).join('、') || '本场AI讨论'}；发言记录：${s.messageIds.join('、')}`).join('\n\n')+
    `\n\n## 反方与边界\n\n${article.counterargument}\n\n## 接下来观察什么\n\n${article.watchList.map(x=>`- ${x}`).join('\n')}\n\n## 可传播的讨论原句\n\n${article.quotes.map(q=>`> ${q.text}\n\nAI框架发言记录 ${q.messageId}`).join('\n\n')}\n\n## 来源\n\n${article.sources.map(s=>`- [${s.publisher} · ${s.title}](${s.url}) · ${s.published} · ${s.access==='article'?'已读取原文段落':s.access==='feed'?'订阅摘要':'仅标题'}`).join('\n')}\n\n本场记录：${article.sessionId}；原文指纹：${article.transcriptHash}\n`;
}
