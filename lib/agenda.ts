import { day } from './server';
import { callModelJson } from './model-client';
import { CHINA_AGENDA_VERSION, categoryFor, chinaCategories, newsScore, parseChinaList, parseChinaMediaList, recentChinaSource, stripMarkup, type ChinaCategory } from './china-news';
export type AgendaSource = { title: string; publisher: string; url: string; published: string; category: string; excerpt?: string; official?: boolean };
export type AgendaTopic = { id: string; day: string; category: string; tag: string; title: string; description: string; tension: string; sources: AgendaSource[]; generationMode: string; freshnessScore: number };
type DatabaseLike = ReturnType<(typeof import('./server'))['database']>;
const sources = [
  { publisher: '中国新闻网 · 财经焦点', url: 'https://www.chinanews.com.cn/finance/', format: 'links', official: false },
  { publisher: '中国新闻网 · 财经', url: 'https://www.chinanews.com.cn/rss/finance.xml', format: 'rss', official: false },
  { publisher: '中国新闻网 · 即时', url: 'https://www.chinanews.com.cn/rss/scroll-news.xml', format: 'rss', official: false },
  { publisher: '国家统计局', url: 'https://www.stats.gov.cn/sj/zxfb/', format: 'list', official: true },
  { publisher: '国家发展改革委', url: 'https://www.ndrc.gov.cn/xwdt/xwfb/', format: 'list', official: true },
];
function xmlTag(block: string, name: string) { return stripMarkup(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || ''); }
export function parseChinaFeed(xml: string, publisher: string): AgendaSource[] {
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).map(block => {
    const title = xmlTag(block, 'title').replace(/\s+-\s+[^-]{2,45}$/u, '');
    return { title, publisher, url: xmlTag(block, 'link'), published: xmlTag(block, 'pubDate'), category: categoryFor(title), excerpt: xmlTag(block, 'description').slice(0, 500) };
  }).filter(x => /^https:\/\//.test(x.url));
}
async function fetchSource(source: typeof sources[number]) {
  const response = await fetch(source.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EconomicsSalon/2.0)', 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html, application/xml, application/rss+xml' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error('source unavailable');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 1000000) throw new Error('source too large');
  const probe = new TextDecoder().decode(buffer.slice(0, 2000));
  const encoding = /(?:charset|encoding)\s*=?\s*["']?(gb2312|gbk|gb18030)/i.test(probe) ? 'gb18030' : 'utf-8';
  const body = new TextDecoder(encoding).decode(buffer);
  return (source.format === 'rss' ? parseChinaFeed(body, source.publisher) : source.format === 'links' ? parseChinaMediaList(body, source.url, source.publisher) : parseChinaList(body, source.url, source.publisher)).map(x => ({ ...x, official: source.official }));
}
function hash(text: string) { let h=2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h>>>0).toString(36); }
function ruleTopics(evidence: AgendaSource[], date: string) {
  const result: AgendaTopic[] = [];
  for (const category of Object.keys(chinaCategories) as ChinaCategory[]) {
    const lead = evidence.find(x => x.category === category);
    if (!lead) continue; // Never invent a current headline to fill a category.
    const meta = chinaCategories[category];
    const title = `${lead.title.slice(0, 60)}：这对中国经济意味着什么？`;
    result.push({ id: `agenda-${date}-china-${hash(title)}`, day: date, category, tag: meta.tag, title,
      description: `从${lead.publisher}的近期报道出发，讨论${meta.tension}。标题仅为选题线索，事实与机制将在沙龙中区分。`,
      tension: meta.tension, sources: [lead], generationMode: `${CHINA_AGENDA_VERSION}:source-rules`, freshnessScore: newsScore(lead, Boolean(lead.official), evidence) });
  }
  return result.sort((a,b) => b.freshnessScore-a.freshnessScore);
}
async function collectAgenda(date: string): Promise<AgendaTopic[]> {
  const results = await Promise.allSettled(sources.map(fetchSource));
  const unique = new Map<string, AgendaSource>();
  for (const row of results.flatMap(r => r.status === 'fulfilled' ? r.value : [])) {
    if (!recentChinaSource(row)) continue;
    const key = row.title.replace(/[^\p{L}\p{N}]/gu, '');
    const prior=unique.get(key);
    if (!prior || (!prior.excerpt && row.excerpt)) unique.set(key, row);
  }
  const all = [...unique.values()];
  const ranked = all.sort((a,b) => newsScore(b, Boolean(b.official), all) - newsScore(a, Boolean(a.official), all));
  // Preserve topic breadth, then rank the most consequential signals within it.
  const evidence = (Object.keys(chinaCategories) as ChinaCategory[]).flatMap(category => ranked.filter(x => x.category === category).slice(0, 4));
  if (!evidence.length) return [];
  try {
    const response = await callModelJson([
      '你是中国经济沙龙的选题编辑。只依据输入中新近的中国经济报道，选出3至5个有具体冲突、关系企业或居民生活的问题。',
      '不要强行凑领域；优先宏观政策、收入消费就业、住房与地方财政、产业创新、外贸金融。排除海外公司人事、广告与仪式新闻。',
      '关注度仅是编辑判断，不得声称某话题是热搜第一。每个问题聚焦一件事；引用的来源必须属于同一问题，不要拼接无关新闻。',
      '输出严格JSON：{"topics":[{"category":"macro|consumption|real-estate|industry|trade","title":"中文问句","description":"为何值得讨论","tension":"关键分歧","sourceIndexes":[0]}]}。不得补写输入未给的事实、数字或新闻。',
    ].join('\n'), { observationDate: date, evidence: evidence.map((x,index) => ({ index, ...x, excerpt: x.excerpt?.slice(0,240) })) }, { type:'object',properties:{topics:{type:'array'}},required:['topics'] }, 2100, raw => {
      if (!Array.isArray(raw.topics) || raw.topics.length < 3 || raw.topics.length > 5) throw new Error('选题结构不完整');
      const seen = new Set<string>();
      return raw.topics.map((rawTopic: unknown) => {
        const t = rawTopic as Record<string,unknown>; const category=String(t.category) as ChinaCategory;
        if (!chinaCategories[category]) throw new Error('选题领域错误');
        const title=String(t.title || '').trim().slice(0,110);
        const refs=Array.isArray(t.sourceIndexes) ? t.sourceIndexes : [];
        const linked=refs.map(i => typeof i === 'number' && Number.isInteger(i) ? evidence[i] : null).filter((x): x is AgendaSource => Boolean(x)).slice(0,3);
        if (title.length<10 || !linked.length || seen.has(title)) throw new Error('选题来源缺失');
        seen.add(title);
        return { id:`agenda-${date}-china-${hash(title)}`,day:date,category,tag:chinaCategories[category].tag,title,
          description:String(t.description || '').slice(0,260),tension:String(t.tension || chinaCategories[category].tension).slice(0,220),sources:linked,
          generationMode:`${CHINA_AGENDA_VERSION}:free-model`, freshnessScore: Math.max(...linked.map(x => newsScore(x,Boolean(x.official),evidence))) } satisfies AgendaTopic;
      }).sort((a,b) => b.freshnessScore-a.freshnessScore);
    });
    return response.value;
  } catch { return ruleTopics(evidence, date); }
}
function rowToTopic(row: Record<string,unknown>): AgendaTopic {
  let refs: AgendaSource[]=[];try{ refs=JSON.parse(String(row.sources_json || '[]')); }catch{}
  return { id:String(row.id),day:String(row.day),category:String(row.category),tag:String(row.tag),title:String(row.title),description:String(row.description),tension:String(row.tension),sources:refs,generationMode:String(row.generation_mode),freshnessScore:Number(row.freshness_score)||0 };
}
export async function getAgenda(db: DatabaseLike,date=day()) {
  const result = await db.prepare("SELECT * FROM agenda_topics WHERE day=? AND generation_mode LIKE 'china-v2:%' ORDER BY freshness_score DESC,created ASC").bind(date).all<Record<string,unknown>>();
  return result.results.map(rowToTopic);
}
let pending: { day: string; promise: Promise<AgendaTopic[]> } | null = null;
let emptyRetryAt=0;
export async function ensureDailyAgenda(db:DatabaseLike,date=day()):Promise<AgendaTopic[]> {
  const existing=await getAgenda(db,date);
  if (existing.length) return existing;
  if (pending?.day===date) return pending.promise;
  if (Date.now()<emptyRetryAt) return [];
  const promise=(async()=>{
    const topics=await collectAgenda(date);const now=Date.now();
    if(!topics.length){emptyRetryAt=now+300000;return [];}
    await db.batch(topics.map(t=>db.prepare('INSERT OR IGNORE INTO agenda_topics (id,day,category,tag,title,description,tension,sources_json,generation_mode,freshness_score,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(t.id,t.day,t.category,t.tag,t.title,t.description,t.tension,JSON.stringify(t.sources),t.generationMode,t.freshnessScore,now)));
    return getAgenda(db,date);
  })();
  pending={day:date,promise};
  try{return await promise;}finally{pending=null;}
}
export function agendaContext(topic:AgendaTopic) {return JSON.stringify({category:topic.category,tag:topic.tag,tension:topic.tension,sources:topic.sources,generationMode:topic.generationMode,protocolVersion:2,scope:'china'});}
export function parseAgendaContext(value:unknown) {
  try{return JSON.parse(String(value||'{}')) as {category?:string;tag?:string;tension?:string;sources?:AgendaSource[];research?:import('./research').ResearchItem[];generationMode?:string;protocolVersion?:number;scope?:string};}catch{return {};}
}
