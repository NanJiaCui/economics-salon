import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../lib/discussion.ts', import.meta.url),'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { generateDiscussionTurn, remember, chooseNext, parseDiscussion, readSpeeches } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const ids = ['bernanke','mundell','aghion','shiller','solow'];
const brief = { tension: '投入与收益未必同步', lenses: Object.fromEntries(ids.map(s => [s, { claim: `${s}的机制需要检验`, test: `${s}的同口径数据`, question: `${s}的假设能否成立？` }])) };
const inherited = [{ sessionId: 'past', title: '旧议题', speaker: 'aghion', question: '长期回报是否兑现？', messageId: 'past-1' }];
const history = [];
for (let i=0; i<14; i++) {
  const speech = generateDiscussionTurn({ id:`m${i}`, sessionId:'today', title:'AI扩张', category:'ai', brief, history, inherited, question:i === 5 ? '观众的问题' : undefined });
  if (speech.note.targetId) assert.ok(history.some(h => h.id === speech.note.targetId),'targets must already exist');
  if (speech.note.action === '回应质询') {
    const challenge = history.find(h => h.id === speech.note.targetId);
    assert.equal(challenge.note.action,'质询');
    assert.equal(speech.speaker,history.find(h => h.id === challenge.note.targetId).speaker);
  }
  history.push(speech);
}
assert.equal(history[0].speaker,'aghion');
assert.ok(history[0].body.includes(inherited[0].question));
assert.equal(chooseNext([], 'finance').speaker,'bernanke');
assert.equal(chooseNext(history,'ai'),null);
assert.equal(history[13].speaker,'host');
assert.ok(history[5].body.includes('观众的问题'));
const saved = remember('today','AI扩张','ai',history,inherited);
assert.equal(saved.memories.length,5);
assert.equal(saved.archive.verified.length,0);
assert.ok(saved.pending.length>0);
assert.equal(saved.addressed.length,2,'both cross-examinations must get a response');
assert.equal(saved.inherited[0].sessionId,'past');
assert.deepEqual(parseDiscussion(JSON.stringify(saved)),saved);
const records = history.map(h => ({...h, meta_json:JSON.stringify(h.note)}));
assert.deepEqual(remember('today','AI扩张','ai',readSpeeches(records),inherited), saved, 'restart rebuild must preserve memory');
assert.equal(parseDiscussion('broken'),null);
const changed = history.slice(0,6).map(h => structuredClone(h));
changed[0].note.claim = '修改后的真实前文观点';
const next = generateDiscussionTurn({ id:'altered',sessionId:'today',title:'AI扩张',category:'ai',brief,history:changed });
assert.ok(next.body.includes('修改后的真实前文观点'),'next statement must actually read prior claim');
assert.ok(!generateDiscussionTurn({id:'clean',sessionId:'new',title:'AI扩张',category:'ai',brief,history:[]}).body.includes('长期回报是否兑现'),'no unprovided cross-session memory');
console.log('PASS: reply targets, moderator resumption, context sensitivity, memory replay, boundaries, archive and isolation');
