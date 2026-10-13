import { database } from './server';
import { readSpeeches } from './discussion';
import { parseAgendaContext } from './agenda';
import { parseResearch } from './research';
import { callModelJson, ModelUnavailableError, type ModelUsage } from './model-client';
import { quotePool, validateArticle, type ArticleState, type MediaArticle } from './media-article';
export async function readArticleState(sessionId:string):Promise<ArticleState> {
  const row=await database().prepare('SELECT * FROM salon_articles WHERE session=?').bind(sessionId).first<Record<string,unknown>>();
  let article:MediaArticle|null=null;try{article=row?.data_json?JSON.parse(String(row.data_json)):null;}catch{}
  return {status:(row?.status || 'pending') as ArticleState['status'],article,error:row?.last_error?String(row.last_error):null,retryAt:Number(row?.retry_at)||0,attempts:Number(row?.attempts)||0};
}
export async function pendingArticleSession() {
  return database().prepare("SELECT s.* FROM sessions s LEFT JOIN salon_articles a ON a.session=s.id WHERE s.scope='global' AND s.mode='live' AND s.id LIKE 'china-%' AND s.status='complete' AND (a.session IS NULL OR (a.status!='ready' AND a.retry_at<=? AND (a.status!='generating' OR a.updated<?))) ORDER BY s.created ASC LIMIT 1").bind(Date.now(),Date.now()-150000).first<Record<string,unknown>>();
}
export async function ensureSalonArticle(salon:Record<string,unknown>) {
  const db=database(),id=String(salon.id),now=Date.now();
  await db.prepare("INSERT OR IGNORE INTO salon_articles (session,status,attempts,retry_at,updated) VALUES (?,'pending',0,0,?)").bind(id,now).run();
  const current=await readArticleState(id);
  if(current.status==='ready')return {status:'complete',turn:Number(salon.turn),articleStatus:'ready'};
  if(current.retryAt>now)return {status:'waiting',turn:Number(salon.turn),articleStatus:current.status,nextAt:current.retryAt};
  const lock=await db.prepare("UPDATE salon_articles SET status='generating',attempts=attempts+1,updated=? WHERE session=? AND status!='ready' AND retry_at<=? AND (status!='generating' OR updated<?)").bind(now,id,now,now-150000).run();
  if(!lock.meta.changes)return {status:'archiving',turn:Number(salon.turn),articleStatus:'generating',nextAt:now+12000};
  const usageWrites=(usages:ModelUsage[])=>usages.map((u,index)=>db.prepare("INSERT OR IGNORE INTO usage_events (id,session,round,provider,model,input_tokens,output_tokens,cached_tokens,estimated_microusd,created) SELECT ?,?,4,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM salon_articles WHERE session=? AND status='generating' AND updated=?)")
    .bind(`${id}:article:${now}:${index}`,id,u.provider,u.model,u.inputTokens,u.outputTokens,u.cachedTokens,u.estimatedMicrousd,Date.now(),id,now));
  try {
    const rows=(await db.prepare('SELECT * FROM messages WHERE session=? ORDER BY created,id').bind(id).all()).results;
    const history=readSpeeches(rows),context=parseAgendaContext(salon.topic_context),sources=parseResearch(context.research);
    if(!history.length||!sources.some(x=>x.access!=='title-only'))throw new Error('本场缺少已读取证据，文章等待来源补充，尚未出稿。');
    const transcriptHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(history))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const instructions=[
      '你是中国经济沙龙的媒体主编，把这一场完整的实际讨论编辑成可传播的深度财经评论。不是会议流水账。',
      '核心任务：用一句有解释力的判断，回答一个读者关心的中国经济问题，解释为什么现在发生、怎样传导、谁会受影响。以真实矛盾或反常现象开场。',
      '内部比较共识推进、反常解释、结构机制三个主判断，选择证据最充分者；正文只保留一个主线，三至四节展开，约1200至1800中文字。标题可有冲突感，但不能写虚假热搜、确定性崩溃预言或夸大数据。',
      '素材来自这一场已保存的发言；提炼不同框架的交锋，而不是重新凭空分析。每节用messageIds指向至少一条真实发言。来源只来自sources输入；sourceIndexes只引用已读原文或摘要，不能引用仅标题条目。',
      '来源陈述与AI的理论解释明确区分。讨论里未被来源支持的数字、政策事实不能进入文章成为事实。不得编造引言、经济学家原话、收益承诺或外部链接。涉及预测只用有条件判断。',
      '必须处理最有力的反方观点，结尾给出能改变判断的可观察指标。文字短句有节奏，避免模板式“赋能”“底层逻辑”“不是X而是Y”和万能排比。',
      'quoteIndexes只能从给定quotePool选择原句作为传播卡，不改写，不将AI框架的发言冒充本人说话。',
      '输出严格JSON：{"title":"主标题","alternatives":["备选标题1","备选标题2"],"dek":"一句导语","thesis":"唯一主判断","lead":"开场两段，用\\n\\n分开","sections":[{"heading":"观点小标题","paragraphs":["段落1","段落2"],"messageIds":["真实ID"],"sourceIndexes":[0]}],"counterargument":"有力反方、适用边界和回应","watchList":["观察指标与证伪条件"],"quoteIndexes":[0,1]}。',
    ].join('\n');
    const result=await callModelJson(instructions,{topic:salon.title,observedAt:new Date().toISOString(),transcript:history,sources,quotePool:quotePool(history)},
      {type:'object',properties:{title:{type:'string'},alternatives:{type:'array'},dek:{type:'string'},thesis:{type:'string'},lead:{type:'string'},sections:{type:'array'},counterargument:{type:'string'},watchList:{type:'array'},quoteIndexes:{type:'array'}},required:['title','alternatives','dek','thesis','lead','sections','counterargument','watchList','quoteIndexes']},3800,raw=>validateArticle(raw,history,sources));
    const article:MediaArticle={version:1,sessionId:id,...result.value,sources,transcriptHash,generatedAt:new Date().toISOString(),model:result.usages.at(-1)?.model || ''};
    await db.batch([...usageWrites(result.usages),db.prepare("UPDATE salon_articles SET status='ready',data_json=?,last_error=NULL,retry_at=0,updated=? WHERE session=? AND status='generating' AND updated=?").bind(JSON.stringify(article),Date.now(),id,now)]);
    return {status:'complete',turn:Number(salon.turn),articleStatus:'ready'};
  } catch(error) {
    const retryAt=error instanceof ModelUnavailableError?error.retryAt:Date.now()+600000;
    await db.batch([...(error instanceof ModelUnavailableError?usageWrites(error.usages):[]),db.prepare("UPDATE salon_articles SET status='waiting',last_error=?,retry_at=?,updated=? WHERE session=? AND status='generating' AND updated=?").bind(error instanceof Error?error.message:'文章生成暂不可用',retryAt,Date.now(),id,now)]);
    return {status:'waiting',turn:Number(salon.turn),articleStatus:'waiting',nextAt:retryAt};
  }
}
