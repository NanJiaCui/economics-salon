import { briefFor } from "@/lib/demo-dialogue";
import { chooseNext, generateDiscussionTurn, remember } from "@/lib/discussion";
import { discussionContext } from "@/lib/discussion-store";
import { apiError, database, json } from "@/lib/server";
import {
  currentTurn,
  ensureCurrentSalon,
  generateRound,
  nextAtForTurn,
  schedule,
} from "@/lib/autopilot";

export async function POST() {
  try {
    const db = database();
    const salon = await ensureCurrentSalon();
    const turn = currentTurn(salon);
    if (!turn) return json({ status: "complete", turn: schedule.length });
    const now = Date.now();
    const allowImmediateDemoStart =
      String(salon.mode) === "demo" && Number(salon.turn) === 0;
    if (Number(salon.next_at) > now && !allowImmediateDemoStart)
      return json({
        status: "waiting",
        turn: salon.turn,
        nextAt: salon.next_at,
      });
    const locked = await db
      .prepare(
        "UPDATE sessions SET engine_state='thinking',status='active',updated=?,last_error=NULL WHERE id=? AND turn=? AND (? OR next_at<=?) AND (engine_state!='thinking' OR updated<?)",
      )
      .bind(
        now,
        salon.id,
        salon.turn,
        allowImmediateDemoStart ? 1 : 0,
        now,
        now - 180000,
      )
      .run();
    if (!locked.meta.changes)
      return json({ status: "thinking", turn: salon.turn });
    try {
      const history = (
        await db
          .prepare(
            "SELECT * FROM messages WHERE session=? ORDER BY created,id",
          )
          .bind(salon.id)
          .all()
      ).results as Record<string, unknown>[];
      const question =
        turn.speaker === "host"
          ? await db
              .prepare(
                "SELECT q.*,COUNT(l.id) AS votes FROM questions q LEFT JOIN likes l ON l.question=q.id WHERE q.session=? AND q.status='queued' GROUP BY q.id ORDER BY votes DESC,q.created ASC LIMIT 1",
              )
              .bind(salon.id)
              .first<Record<string, unknown>>()
          : null;
      if (salon.mode === "demo") {
        const context = await discussionContext(salon, history);
        const plan = chooseNext(context.history, context.category, Number(salon.turn));
        if (!plan) return json({ status: "complete" });
        const id = `${salon.id}:protocol-1:${salon.turn}`;
        const speech = generateDiscussionTurn({
          id, sessionId: String(salon.id), title: String(salon.title),
          category: context.category, history: context.history, inherited: context.inherited,
          position: Number(salon.turn), question: question ? String(question.body) : undefined,
          brief: briefFor(String(salon.topic_id), String(salon.title), salon.topic_context),
        });
        const snapshot = remember(String(salon.id), String(salon.title), context.category, [...context.history, speech], context.inherited);
        const nextTurn = Number(salon.turn) + 1;
        const complete = nextTurn >= schedule.length;
        const nextAt = nextAtForTurn(nextTurn, String(salon.mode));
        // The insert and state checkpoint commit together. A stale lock owner cannot publish.
        const writes = [
          db.prepare("INSERT INTO messages (id,session,round,speaker,kind,body,meta_json,created) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND turn=? AND updated=? AND engine_state='thinking')").bind(id, salon.id, speech.round, speech.speaker, speech.kind, speech.body, JSON.stringify(speech.note), Date.now(), salon.id, salon.turn, now),
          db.prepare("UPDATE sessions SET discussion_json=?,turn=?,round=?,next_at=?,engine_state=?,status=?,updated=? WHERE id=? AND turn=? AND updated=? AND engine_state='thinking'").bind(JSON.stringify(snapshot),nextTurn,speech.round,nextAt,complete ? 'complete' : 'waiting',complete ? 'complete' : 'active',Date.now(),salon.id,salon.turn,now),
          db.prepare("DELETE FROM turn_queue WHERE session=? AND EXISTS (SELECT 1 FROM messages WHERE id=?)").bind(salon.id,id),
        ];
        if (question) writes.push(db.prepare("UPDATE questions SET status='included' WHERE id=? AND EXISTS (SELECT 1 FROM messages WHERE id=?)").bind(question.id,id));
        const committed = await db.batch(writes);
        if (!committed[0].meta.changes) return json({ status: 'thinking', turn: salon.turn });
        return json({ status: complete ? 'complete' : 'advanced', id, turn: nextTurn, round: speech.round, nextAt: complete ? null : nextAt, generatedBatch: false });
      }
      let queued = await db
        .prepare("SELECT * FROM turn_queue WHERE session=? AND position=?")
        .bind(salon.id, salon.turn)
        .first<Record<string, unknown>>();
      let generatedBatch = false;
      if (!queued) {
        const roundStart = schedule.findIndex(
          (item) => item.round === turn.round,
        );
        const generated = await generateRound(
          salon,
          turn.round,
          question,
          history,
        );
        const created = Date.now();
        await db.batch(
          generated.turns.map((item, index) =>
            db
              .prepare(
                "INSERT OR IGNORE INTO turn_queue (id,session,position,round,speaker,kind,body,created) VALUES (?,?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                salon.id,
                roundStart + index,
                turn.round,
                item.speaker,
                item.kind,
                item.body,
                created,
              ),
          ),
        );
        if (generated.usage)
          await db
            .prepare(
              "INSERT INTO usage_events (id,session,round,provider,model,input_tokens,output_tokens,cached_tokens,estimated_microusd,created) VALUES (?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              salon.id,
              turn.round,
              generated.usage.provider,
              generated.usage.model,
              generated.usage.inputTokens,
              generated.usage.outputTokens,
              generated.usage.cachedTokens,
              generated.usage.estimatedMicrousd,
              created,
            )
            .run();
        if (question)
          await db
            .prepare("UPDATE questions SET status='included' WHERE id=?")
            .bind(question.id)
            .run();
        generatedBatch = true;
        queued = await db
          .prepare("SELECT * FROM turn_queue WHERE session=? AND position=?")
          .bind(salon.id, salon.turn)
          .first<Record<string, unknown>>();
      }
      if (!queued) throw new Error("本轮发言队列生成失败。");
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO messages (id,session,round,speaker,kind,body,created) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          salon.id,
          queued.round,
          queued.speaker,
          queued.kind,
          queued.body,
          Date.now(),
        )
        .run();
      await db
        .prepare("DELETE FROM turn_queue WHERE id=?")
        .bind(queued.id)
        .run();
      const nextTurn = Number(salon.turn) + 1;
      const complete = nextTurn >= schedule.length;
      const nextAt = nextAtForTurn(nextTurn, String(salon.mode));
      await db
        .prepare(
          "UPDATE sessions SET turn=?,round=?,next_at=?,engine_state=?,status=?,updated=? WHERE id=?",
        )
        .bind(
          nextTurn,
          turn.round,
          nextAt,
          complete ? "complete" : "waiting",
          complete ? "complete" : "active",
          Date.now(),
          salon.id,
        )
        .run();
      return json({
        status: complete ? "complete" : "advanced",
        id,
        turn: nextTurn,
        round: turn.round,
        nextAt: complete ? null : nextAt,
        generatedBatch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "代理生成失败。";
      await db
        .prepare(
          "UPDATE sessions SET engine_state='error',last_error=?,next_at=?,updated=? WHERE id=? AND updated=? AND engine_state='thinking'",
        )
        .bind(message, Date.now() + 60000, Date.now(), salon.id, now)
        .run();
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
