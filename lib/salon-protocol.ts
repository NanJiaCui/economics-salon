import type { Speech, Note, Discussion } from './discussion';
export const CHINA_PROTOCOL_VERSION = 2;
const people = ['bernanke', 'mundell', 'aghion', 'shiller', 'solow'];
export const chinaSchedule = [
  { speaker: 'host', round: 1, kind: '主持开题' },
  ...people.map(speaker => ({ speaker, round: 1, kind: '提出判断' })),
  { speaker: 'host', round: 2, kind: '定位分歧' },
  ...people.map(speaker => ({ speaker, round: 2, kind: '交叉质询与回应' })),
  { speaker: 'host', round: 3, kind: '检验关键条件' },
  ...people.map(speaker => ({ speaker, round: 3, kind: '修正判断' })),
  { speaker: 'host', round: 3, kind: '共识、分歧与后续证据' },
];
export function isChinaSession(session: Record<string, unknown>) {
  try { return JSON.parse(String(session.topic_context || '{}')).protocolVersion === CHINA_PROTOCOL_VERSION; } catch { return false; }
}
export function chinaPlan(history: Speech[], category: string, position: number) {
  const base = chinaSchedule[position];
  if (!base) return null;
  let speaker = base.speaker;
  let target = history.at(-1) || null;
  if (base.round === 2 && speaker !== 'host') {
    // First let a challenged participant answer; otherwise give each framework one turn.
    const used = new Set(history.filter(x => x.round === 2 && x.speaker !== 'host').map(x => x.speaker));
    const challenge = [...history].reverse().find(x => x.note?.action === '质询' && !history.some(h => h.note?.addressedId === x.id));
    const challenged = challenge ? history.find(x => x.id === challenge.note?.targetId) : null;
    if (challenged && !used.has(challenged.speaker)) { speaker = challenged.speaker; target = challenge!; }
    else speaker = people.find(x => !used.has(x)) || speaker;
    if (target?.speaker === 'host') target = [...history].reverse().find(x => x.speaker !== speaker && x.speaker !== 'host') || target;
  }
  const own = [...history].reverse().find(x => x.speaker === speaker) || null;
  const action = speaker === 'host' ? base.kind : base.round === 1 ? '提出判断' :
    target?.note?.action === '质询' && history.find(x => x.id === target?.note?.targetId)?.speaker === speaker ? '回应质询' :
    base.round === 2 ? '质询' : '限定判断';
  return { ...base, speaker, target, own, action, reason: speaker === 'host' ? base.kind : action === '回应质询' ? '优先回应已指向自己的质询' : `依据${category}议题、前文与个人判断继续讨论` };
}
export function conversationInput(history: Speech[], discussion: Discussion, speaker: string) {
  return {
    // Include all contributions in this bounded session; no hidden future turns.
    transcript: history.map(x => ({ id: x.id, speaker: x.speaker, round: x.round, body: x.body, claim: x.note?.claim || null, question: x.note?.question || null })),
    participantMemory: discussion.memories.find(x => x.speaker === speaker) || null,
    allPositions: discussion.memories,
    unresolvedQuestions: discussion.pending,
    historicalLeads: discussion.inherited,
  };
}
const text = (x: unknown, max: number) => typeof x === 'string' ? x.trim().slice(0, max) : '';
export function validateModelSpeech(raw: Record<string, unknown>, plan: NonNullable<ReturnType<typeof chinaPlan>>, history: Speech[], allowedSources: string[]): { body: string; note: Note } {
  const body = text(raw.body, 1100), claim = text(raw.claim, 240), test = text(raw.test, 240), update = text(raw.update, 240);
  if (body.length < 80 || !claim || !test || !update) throw new Error('模型返回的结构化发言不完整');
  const requested = text(raw.targetId, 150);
  if (requested && !history.some(x => x.id === requested)) throw new Error('模型引用了不存在的发言');
  if (history.length && !requested) throw new Error('模型未关联已保存的前文');
  if (plan.action === '回应质询' && requested !== plan.target?.id) throw new Error('没有回应指定的质询');
  const targetId = requested || null;
  const target = history.find(x => x.id === targetId);
  const sourceUrl = text(raw.sourceUrl, 500);
  if (sourceUrl && !allowedSources.includes(sourceUrl)) throw new Error('模型引用了本期未收录的来源');
  return { body, note: { version: 1, action: plan.action, reason: plan.reason, targetId,
    claim, test, question: text(raw.question, 240), update, basis: 'model', sourceUrl: sourceUrl || null,
    addressedId: plan.action === '回应质询' && target?.note?.action === '质询' ? target.id : null } };
}
