import { database } from '@/lib/server';
import { parseAgendaContext } from '@/lib/agenda';
import { parseDiscussion, readSpeeches, remember, type Carry } from '@/lib/discussion';
export async function discussionContext(salon: Record<string, unknown>, rows: Record<string, unknown>[]) {
  const saved = parseDiscussion(salon.discussion_json);
  const category = parseAgendaContext(salon.topic_context).category || 'finance';
  let inherited: Carry[] = saved?.inherited || [];
  if (!saved && salon.status !== 'complete') {
    const older = await database().prepare("SELECT id,discussion_json FROM sessions WHERE scope='global' AND status='complete' AND id!=? AND created<? AND discussion_json IS NOT NULL ORDER BY created DESC LIMIT 30").bind(salon.id, salon.created).all();
    for (const row of older.results) {
      const memory = parseDiscussion(row.discussion_json);
      if (memory?.category === category) { inherited = memory.pending.slice(0, 3); break; }
    }
  }
  const history = readSpeeches(rows);
  return { history, category, inherited, discussion: remember(String(salon.id), String(salon.title), category, history, inherited) };
}
