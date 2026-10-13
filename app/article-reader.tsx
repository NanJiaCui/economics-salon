'use client';
import { useState } from 'react';
import { ArrowRight, Download, Copy, Quote, FileText, Clock3 } from 'lucide-react';
import { articleMarkdown, type ArticleState } from '@/lib/media-article';
import { thinkers } from '@/lib/content';
type Props = { state?: ArticleState|null; completed:boolean; title:string; eligible:boolean; onMessage:(id:string)=>void; onNotice:(text:string)=>void };
export default function ArticleReader({state,completed,title,eligible,onMessage,onNotice}:Props) {
  const [copied,setCopied]=useState(false);
  const article=state?.article;
  async function copy() {if(!article)return;try{await navigator.clipboard.writeText(articleMarkdown(article));setCopied(true);onNotice('文章与来源已复制。');}catch{onNotice('剪贴板暂不可用，可以下载文章。');}}
  function download(){if(!article)return;const url=URL.createObjectURL(new Blob([articleMarkdown(article)],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`中国经济沙龙-${article.generatedAt.slice(0,10)}.md`;a.click();URL.revokeObjectURL(url);}
  if(!article)return <section className="article-pending">
    <div className="eyebrow">FROM DIALOGUE TO A POINT OF VIEW</div><h1>把一场争论，<br/><em>写成值得转发的判断。</em></h1>
    <p className="intro">{title}</p><div className="article-process"><span>完整讨论</span><ArrowRight size={18}/><span>核心判断与反方</span><ArrowRight size={18}/><span>媒体文章与观点卡</span></div>
    <div className="article-wait"><Clock3 size={22}/><div><h2>{!eligible?'这份旧档案保留完整讨论记录':!completed?'沙龙正在讨论，文章将在会后自动形成':state?.status==='generating'?'编辑正在阅读整场发言并成稿':state?.status==='waiting'?'稿件等待模型恢复或补充证据':'讨论已收束，编辑即将开始'}</h2>
    <p>{!eligible?'新版中国经济沙龙会在完成后自动生成文章。':state?.error || '从实际交锋中提炼一个核心观点，保留反方、来源和能改变判断的条件。不会把AI框架发言冒充经济学家本人引言。'}</p></div></div>
    <p className="article-boundary">传播力来自明确的问题、观点与论据。平台不承诺阅读量或转发量。</p>
  </section>;
  return <div className="media-layout"><article className="media-story">
    <div className="eyebrow">CHINA ECONOMY · SALON PERSPECTIVE</div><div className="media-meta"><span>AI 沙龙观察</span><span>{article.generatedAt.slice(0,10)}</span><span>会后编辑成稿</span></div>
    <h1>{article.title}</h1><p className="media-dek">{article.dek}</p>
    <div className="article-actions"><button className="primary" onClick={copy}><Copy size={14}/>{copied?'已复制':'复制全文'}</button><button onClick={download}><Download size={15}/>下载 Markdown</button></div>
    <p className="article-boundary">基于本场实际 AI 对话编辑；理论框架代理不代表经济学家本人。文中的机制判断与现实来源陈述需要分别理解。</p>
    <div className="media-thesis"><small>本篇核心判断</small><p>{article.thesis}</p></div>
    {article.lead.split(/\n+/).filter(Boolean).map((p,i)=><p className="media-paragraph" key={i}>{p}</p>)}
    {article.sections.map((s,i)=><section className="media-section" key={i}><span className="media-number">0{i+1}</span><h2>{s.heading}</h2>{s.paragraphs.map((p,j)=><p key={j}>{p}</p>)}
      <div className="article-references"><FileText size={13}/>{s.sourceIndexes.map(index=><a key={index} href={article.sources[index].url} target="_blank" rel="noreferrer">来源 {index+1} ↗</a>)}{s.messageIds.map(id=><button key={id} onClick={()=>onMessage(id)}>回看发言 ↗</button>)}</div>
    </section>)}
    <section className="media-section"><span className="section-label">THE STRONGEST OBJECTION</span><h2>反方为何仍然重要</h2><p>{article.counterargument}</p></section>
    <section className="media-watch"><h2>接下来，观察什么？</h2><ol>{article.watchList.map((p,i)=><li key={i}>{p}</li>)}</ol></section>
  </article><aside className="media-sidebar"><section><div className="eyebrow">A DIFFERENT ANGLE</div><h3>同一观点的标题表达</h3>{article.alternatives.map(t=><p className="alternate-title" key={t}>{t}</p>)}</section>
    {!!article.quotes.length&&<section><div className="eyebrow">LINES FROM THE TABLE</div><h3>值得记住的讨论原句</h3>{article.quotes.map((q,i)=><blockquote key={i}><Quote size={18}/><p>{q.text}</p><button onClick={()=>onMessage(q.messageId)}>{thinkers.find(x=>x.id===q.speaker)?.cn || '主持人'} · AI框架发言 ↗</button></blockquote>)}</section>}
    <section><div className="eyebrow">THE EVIDENCE DESK</div><h3>本篇来源</h3>{article.sources.map((s,i)=><div className="article-source" key={s.url}><small>{i+1} / {s.publisher} · {s.access==='article'?'原文段落':s.access==='feed'?'订阅摘要':'仅标题'}</small><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><small>{Number.isFinite(Date.parse(s.published))?new Date(s.published).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):s.published}</small></div>)}</section>
    <p className="article-boundary">原文记录已封存，文章各节可以回溯对应发言；传播原句直接取自本场记录。</p>
  </aside></div>;
}
