/** Pure, deterministic protocol. Rules are not model reasoning or verified evidence. */
export type Lens = { claim: string; test: string; question: string };
export type DiscussionBrief = { tension: string; lenses: Record<string, Lens> };
export type Note = {
  version: 1; action: string; reason: string; targetId: string | null;
  claim: string; test: string; question: string; addressedId: string | null;
  update: string; basis: 'framework'; sourceUrl?: string | null;
};
export type Speech = { id: string; speaker: string; body: string; round: number; kind: string; note?: Note | null };
export type Carry = { sessionId: string; title: string; speaker: string; question: string; messageId: string };
export type Memory = { speaker: string; claim: string; test: string; question: string; messageId: string; updates: { messageId: string; text: string }[] };
export type Discussion = {
  version: 1; category: string; inherited: Carry[]; memories: Memory[];
  pending: Carry[]; addressed: string[]; archive: { summary: string; claims: Memory[]; unresolved: Carry[]; verified: string[] };
};
const people: Record<string, string> = { bernanke: '伯南克', mundell: '蒙代尔', aghion: '阿吉翁', shiller: '席勒', solow: '索洛', host: '主持人' };
const orders: Record<string, string[]> = {
  ai: ['aghion', 'solow', 'shiller', 'bernanke', 'mundell'],
  finance: ['bernanke', 'shiller', 'mundell', 'solow', 'aghion'],
  hospitality: ['shiller', 'solow', 'aghion', 'bernanke', 'mundell'],
  'real-estate': ['bernanke', 'shiller', 'solow', 'aghion', 'mundell'],
};
export const DISCUSSION_TOTAL = 14;
export function parseNote(raw: unknown): Note | null {
  try { const x = typeof raw === 'string' ? JSON.parse(raw) : raw; return x?.version === 1 ? x as Note : null; } catch { return null; }
}
export function parseDiscussion(raw: unknown): Discussion | null {
  try { const x = typeof raw === 'string' ? JSON.parse(raw) : raw; return x?.version === 1 && Array.isArray(x.memories) ? x as Discussion : null; } catch { return null; }
}
export function readSpeeches(rows: Record<string, unknown>[]): Speech[] {
  return rows.map(r => ({ id: String(r.id), speaker: String(r.speaker), body: String(r.body), round: Number(r.round), kind: String(r.kind), note: parseNote(r.meta_json) }));
}
export function remember(sessionId: string, title: string, category: string, history: Speech[], inherited: Carry[] = []): Discussion {
  const memories: Memory[] = [];
  const addressed = history.flatMap(h => h.note?.addressedId ? [h.note.addressedId] : []);
  for (const h of history) {
    if (h.speaker === 'host' || !h.note) continue;
    let m = memories.find(x => x.speaker === h.speaker);
    if (!m) { m = { speaker: h.speaker, claim: '', test: '', question: '', messageId: h.id, updates: [] }; memories.push(m); }
    m.claim = h.note.claim; m.test = h.note.test; m.question = h.note.question; m.messageId = h.id;
    m.updates.push({ messageId: h.id, text: h.note.update });
  }
  const pending = history.filter(h => h.note?.question && !addressed.includes(h.id)).map(h => ({ sessionId, title, speaker: h.speaker, question: h.note!.question, messageId: h.id }));
  return { version: 1, category, inherited, memories, pending, addressed,
    archive: { summary: history.length >= DISCUSSION_TOTAL ? '本期规则推演已结束；以下保留各框架判断与检验条件，没有新增已核验事实，也不把轮流发言计为共识。' : '讨论进行中，观点和问题随每条已保存的发言更新。', claims: memories, unresolved: pending, verified: [] } };
}
export function chooseNext(history: Speech[], category: string, position = history.length) {
  if (position >= DISCUSSION_TOTAL) return null;
  const order = orders[category] || orders.finance;
  const last = history.at(-1);
  const answered = new Set(history.flatMap(h => h.note?.addressedId ? [h.note.addressedId] : []));
  const open = history.find(h => h.speaker !== 'host' && h.note?.question && !answered.has(h.id));
  const round = position < 5 ? 1 : position < 9 ? 2 : 3;
  if ([5, 9, 13].includes(position)) return { speaker: 'host', round, action: position === 13 ? '归档' : '主持追问', target: open || last, reason: position === 13 ? '达到本期轮次上限，保留未决问题，避免无证据循环。' : '汇总尚未回答的问题，把讨论重新聚焦到可检验的分歧。' };
  if (position < 5) {
    const speaker = order.find(s => !history.some(h => h.speaker === s)) || order[position];
    return { speaker, round, action: '提出判断', target: last, reason: `按议题领域邀请尚未发言的${people[speaker]}框架，补充不同的分析口径。` };
  }
  if (last?.note?.action === '质询') {
    const target = history.find(h => h.id === last.note?.targetId);
    return { speaker: target?.speaker || order[0], round, action: '回应质询', target: last, reason: `上一条质询指向${people[target?.speaker || order[0]]}，优先给被质询者回应机会。` };
  }
  if ([6, 8].includes(position)) {
    const target = open || history.find(h => h.speaker !== 'host');
    const speaker = order.filter(s => s !== target?.speaker).sort((a,b) => history.filter(h => h.speaker === a).length - history.filter(h => h.speaker === b).length)[0];
    return { speaker, round, action: '质询', target, reason: '选择最早未回答的问题，邀请另一框架检查它遗漏的条件。' };
  }
  // A moderator interjection must not lose the outstanding challenge.
  const challenge = [...history].reverse().find(h => h.note?.action === '质询' && !answered.has(h.id));
  if (challenge) {
    const target = history.find(h => h.id === challenge.note?.targetId);
    return { speaker: target?.speaker || order[0], round, action: '回应质询', target: challenge, reason: '主持人梳理后，继续处理尚未得到回应的质询。' };
  }
  const speaker = [...order].sort((a,b) => history.filter(h => h.speaker === a && h.round > 1).length - history.filter(h => h.speaker === b && h.round > 1).length)[0];
  return { speaker, round, action: '限定判断', target: open || last, reason: '邀请后续回应较少的框架，明确原判断的适用边界和反证条件。' };
}
export function generateDiscussionTurn(input: { id: string; sessionId: string; title: string; category: string; brief: DiscussionBrief; history: Speech[]; position?: number; inherited?: Carry[]; question?: string; research?: import('@/lib/research').ResearchItem[] }): Speech {
  const { history, brief, title, category } = input;
  const plan = chooseNext(history, category, input.position);
  if (!plan) throw new Error('本期讨论已完成');
  const { speaker, target, action, round, reason } = plan;
  const old = [...history].reverse().find(h => h.speaker === speaker && h.note);
  const lens = brief.lenses[speaker];
  const targetClaim = target?.note?.claim || target?.body || '';
  const quote = target ? `回应${people[target.speaker] || target.speaker}这句话：“${targetClaim.slice(0, 140)}${targetClaim.length > 140 ? '…' : ''}”。` : `围绕“${title}”，我先提出一个待检验判断。`;
  const test = lens?.test || '';
  const researched = input.research?.filter(x => x.access !== 'title-only' && x.excerpt) || [];
  const source = speaker === 'host' ? null : researched[(input.position ?? history.length) % researched.length] || null;
  const sourceLine = source ? `本期研究档案读取了${source.publisher}的《${source.title}》${source.access === 'feed' ? '订阅摘要' : '文章段落'}：“${source.excerpt.slice(0, 110)}”。这属于来源陈述，仍需独立核验；我据此追问：${test}。` : '';
  let body = '', claim = lens?.claim || brief.tension, question = lens?.question || '', addressedId: string | null = null;
  let update = '首次记录该框架的待检验判断；依据为理论框架，尚未用现实数据验证。';
  if (speaker === 'host') {
    const state = remember(input.sessionId, title, category, history, input.inherited);
    body = action === '归档'
      ? `本期“${title}”先停在这里。已记录${state.memories.length}个框架的判断，仍有${state.pending.length}条待检验问题。${state.pending.slice(0, 2).map(x => `${people[x.speaker]}追问：${x.question}`).join(' ')} 没有新的核验结果，不能把观点收束写成事实共识。下一次讨论优先检查这些问题和各人的反证条件。`
      : `${input.question ? `观众问：“${input.question.slice(0,220)}”。这条问题先列入待回应清单。` : ''}目前的关键张力是：${brief.tension}。${target ? `${people[target.speaker]}提出的问题仍待检验：“${target.note?.question || targetClaim.slice(0,140)}”。` : ''}请下一位明确回应具体判断，给出适用边界与反例；没有新资料时保留不确定性。`;
    question = input.question?.slice(0,220) || '';
    update = action === '归档' ? '保存分歧与待验证条件；未自动确认共识。' : '重新分配回应顺序，不替参与者宣布结论。';
  } else if (action === '质询') {
    question = `在“${target?.note?.question || targetClaim.slice(0,90)}”之外，是否还需要${test}，才能支持原判断？`;
    body = `${quote}我的分析口径是：${claim} ${sourceLine}这还不能直接反驳你的判断，但它增加了一个检验条件：${test}。${question}`;
    update = '新增对另一框架的质询，尚未获得反证，保留原判断。';
  } else if (action === '回应质询' || action === '限定判断') {
    const extra = target?.note?.test;
    claim = old?.note?.claim || claim;
    body = `${quote}${old ? `我之前的判断是：“${claim.slice(0,160)}”。` : claim} ${sourceLine}${extra ? `你要求${extra}，这个条件需要单独核验。` : ''}我的结论只能在${test}得到支持时成立；如果该检验不支持原有机制，我会收缩适用范围。现在没有新增已核验数据，因此保留条件判断，不宣布立场已经被事实推翻。`;
    addressedId = action === '回应质询' ? target?.id || null : null;
    question = lens.question;
    update = `${action === '回应质询' ? '已回应质询' : '补充判断边界'}；立场保持待检验${extra ? `，新增检查：${extra}` : ''}。`;
  } else {
    const inherited = input.inherited?.find(x => x.speaker === speaker);
    body = `${quote}${claim} ${sourceLine || `我提出的检验是：${test}。`}${question}${inherited ? `此前同领域讨论留下一个问题：“${inherited.question.slice(0,180)}”。它只作为待核验线索，不是本期事实。` : ''}`;
  }
  return { id: input.id, speaker, round, kind: `${action} · 规则推演`, body,
    note: { version: 1, action, reason, targetId: target?.id || null, claim, test, question, addressedId, update, basis: 'framework', sourceUrl: source?.url || null } };
}
