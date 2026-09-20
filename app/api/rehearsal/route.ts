import { ensureCurrentSalon } from '@/lib/autopilot';
import { briefFor } from '@/lib/demo-dialogue';
import { discussionContext } from '@/lib/discussion-store';
import { DISCUSSION_TOTAL, generateDiscussionTurn, remember } from '@/lib/discussion';
import { json, apiError } from '@/lib/server';
/** Read-only deterministic rehearsal; no model, no shared messages or usage writes. */
export async function GET() {
  try {
    const salon = await ensureCurrentSalon();
    const ctx = await discussionContext(salon, []);
    const history = ctx.history;
    for (let i=0; i<DISCUSSION_TOTAL; i++) history.push(generateDiscussionTurn({
      id: `rehearsal-${i}`, sessionId: 'rehearsal', title: String(salon.title),
      category: ctx.category, history, inherited: ctx.inherited,
      brief: briefFor(String(salon.topic_id),String(salon.title),salon.topic_context),
    }));
    return json({ messages: history, discussion: remember('rehearsal',String(salon.title),ctx.category,history,ctx.inherited) });
  } catch (e) { return apiError(e); }
}
