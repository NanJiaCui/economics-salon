/** Source selection is deterministic; interest scores are editorial proxies, not traffic data. */
import type { AgendaSource } from './agenda';
export const CHINA_AGENDA_VERSION = 'china-v2';
export const chinaCategories = {
  macro: { tag: '宏观与政策', tension: '增长、物价和政策力度怎样传导到企业现金流与居民收入' },
  consumption: { tag: '消费与就业', tension: '消费热度、收入预期与企业利润是否同步改善' },
  'real-estate': { tag: '住房与地方财政', tension: '住房需求、资产负债表修复与地方财政之间如何相互传导' },
  industry: { tag: '产业与创新', tension: '技术投入、竞争格局与生产率提升能否形成可持续回报' },
  trade: { tag: '外贸与金融', tension: '外部需求、汇率与国内融资条件如何改变中国企业的经营约束' },
} as const;
export type ChinaCategory = keyof typeof chinaCategories;
export function categoryFor(title: string): ChinaCategory {
  if (/房地产|住房|房价|购房|楼市|土地出让|地方债|化债|城投/.test(title)) return 'real-estate';
  if (/消费|旅游|文旅|酒店|餐饮|就业|工资|收入|社保|养老|零售|假期/.test(title)) return 'consumption';
  if (/出口|进口|外贸|关税|贸易|人民币|汇率|金融|信贷|银行|货币|融资|债券/.test(title)) return 'trade';
  if (/产业|制造|人工智能|大模型|芯片|新能源|汽车|创新|科技|新质生产力|算力/.test(title)) return 'industry';
  return 'macro';
}
const economy = /经济|消费|投资|财政|货币|金融|房地产|住房|就业|收入|产业|制造|出口|进口|外贸|贸易|关税|人民币|汇率|融资|银行|债券|物价|价格|利润|增长|市场|旅游|文旅|酒店|零售|新能源|人工智能|大模型|芯片|汽车|新质生产力|企业|民营|采购经理|生产资料|物流|景气|营商|资本/;
const noise = /任免|任职|人事|开幕式|招聘启事|征文|直播海报|图片集|专题会议协调|新闻发言人名单/;
export function recentChinaSource(source: AgendaSource, now = Date.now()) {
  const timestamp = Date.parse(source.published);
  const foreign = /泰国|美国|英国|日本|韩国|印度|印尼|欧洲|欧盟|德国|法国|巴西|俄罗斯|美联储|IMF|国际货币基金/.test(source.title);
  const chinaLink = /中国|我国|人民币|对华|来华|在华|中美|中欧|中日|中非|华为|中国经济/.test(source.title);
  return (!foreign || chinaLink) && /[\u4e00-\u9fff]/.test(source.title) && economy.test(source.title) && !noise.test(source.title) &&
    Number.isFinite(timestamp) && timestamp <= now + 15 * 60000 && timestamp >= now - 7 * 86400000;
}
export function newsScore(source: AgendaSource, official: boolean, all: AgendaSource[], now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(source.published)) / 3600000);
  const terms = source.title.match(/消费|就业|房地产|外贸|关税|人民币|人工智能|财政|金融|物价|民营|新质生产力/g) || [];
  const independent = new Set(all.filter(item => item.url !== source.url && item.publisher.split(' · ')[0] !== source.publisher.split(' · ')[0] && terms.some(term => item.title.includes(term))).map(x => x.publisher.split(' · ')[0])).size;
  const significance = /全国|我国|经济形势|国务院|政策|统计|财政|货币|进出口|新质生产力|居民收入|社会消费|央行|采购经理|景气指数|价格变动/.test(source.title) ? 55 : /房地产|就业|消费|产业|利率|关税/.test(source.title) ? 12 : 0;
  return Math.round(Math.max(0, 90 - ageHours * .35) + significance + (official ? 18 : 0) + Math.min(18, independent * 6));
}
export function stripMarkup(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
}
export function parseChinaList(html: string, base: string, publisher: string): AgendaSource[] {
  // The official NBS and NDRC lists expose an article link and publication date in each li.
  const clean = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const result: AgendaSource[] = [];
  for (const block of clean.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []) {
    const date = block.match(/20\d{2}[-/]\d{2}[-/]\d{2}/)?.[0];
    const anchor = block.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const href = anchor?.[1].match(/href=["']([^"']+)["']/i)?.[1];
    const title = stripMarkup(anchor?.[1].match(/title=["']([^"']+)["']/i)?.[1] || anchor?.[2] || '');
    if (!date || !href || title.length < 8) continue;
    try {
      const url = new URL(href, base);
      if (url.protocol !== 'https:' || url.hostname !== new URL(base).hostname) continue;
      result.push({ title, publisher, url: url.href, published: `${date.replaceAll('/', '-')}T09:00:00+08:00`, category: categoryFor(title) });
    } catch { /* Ignore malformed links. */ }
  }
  return result;
}

export function parseChinaMediaList(html: string, base: string, publisher: string): AgendaSource[] {
  const result: AgendaSource[] = [];
  for (const anchor of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []) {
    const href=anchor.match(/href=["']([^"']+)["']/i)?.[1];
    const date=href?.match(/\/cj\/(20\d{2})\/(\d{2})-(\d{2})\//);
    if(!href||!date)continue;
    let title=stripMarkup(anchor).replace(/^-\s*/, '');
    const words=title.split(/\s+/); if(words.length===2 && words[0]===words[1])title=words[0];
    if(title.length<8 || title.length>120 || /中新网.+电|数据显示|记者|\.\.\./.test(title))continue;
    try {const url=new URL(href,base);if(url.hostname===new URL(base).hostname&&url.protocol==='https:')result.push({title,publisher,url:url.href,published:`${date[1]}-${date[2]}-${date[3]}T00:00:00+08:00`,category:categoryFor(title)});}catch{}
  }
  return result;
}
