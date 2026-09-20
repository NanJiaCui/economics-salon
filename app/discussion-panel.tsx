import type { Discussion } from '@/lib/discussion';
import { thinkers } from '@/lib/content';
const name = (id: string) => thinkers.find(t => t.id === id)?.cn || '主持人';
export default function DiscussionPanel({ discussion, onMessage }: { discussion?: Discussion; onMessage: (id: string) => void }) {
  if (!discussion) return null;
  return <section className="discussion-ledger" aria-label="观点记忆与思想档案">
    <div className="eyebrow">THE WORKING NOTEBOOK</div>
    <h2>判断如何留下痕迹</h2>
    <p className="muted">{discussion.archive.summary}</p>
    <div className="ledger-stats"><span>{discussion.memories.length} 个框架记忆</span><span>{discussion.pending.length} 条待检验问题</span><span>{discussion.addressed.length} 次明确回应</span></div>
    {!discussion.memories.length && <p className="muted">这期尚无结构化记忆。旧版发言原文完整保留；可以点击“机制演练”体验新流程。</p>}
    <div className="memory-grid">{discussion.memories.map(m => <details key={m.speaker} className="memory-card">
      <summary><b>{name(m.speaker)}框架</b><span>{m.updates.length} 次记录 · 待检验</span></summary>
      <p>{m.claim}</p><small>检验条件</small><p>{m.test}</p>
      <ol>{m.updates.map((u,i) => <li key={u.messageId}><button onClick={() => onMessage(u.messageId)}>记录 {i+1} ↗</button> {u.text}</li>)}</ol>
    </details>)}</div>
    {!!discussion.pending.length && <details className="pending-questions" open><summary>未决问题 · 回应不等于验证</summary>{discussion.pending.map(q => <p key={q.messageId}><button onClick={() => onMessage(q.messageId)}>{name(q.speaker)} ↗</button> {q.question}</p>)}</details>}
    {!!discussion.inherited.length && <details className="pending-questions"><summary>从同领域档案接续的线索</summary>{discussion.inherited.map(q => <p key={q.messageId}><a href={`/?session=${encodeURIComponent(q.sessionId)}`}>{q.title}</a>：{q.question}<small>仅为历史待核验问题，不继承为本期事实。</small></p>)}</details>}
    <p className="ledger-boundary">资料边界：当前为规则推演。理论框架和议题来源不等于已验证论据；系统不会自动宣布共识或把推演当作事实。</p>
  </section>;
}
