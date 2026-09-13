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
    if (Number(salon.next_at) > now)
      return json({
        status: "waiting",
        turn: salon.turn,
        nextAt: salon.next_at,
      });
    const locked = await db
      .prepare(
        "UPDATE sessions SET engine_state='thinking',status='active',updated=?,last_error=NULL WHERE id=? AND turn=? AND next_at<=? AND (engine_state!='thinking' OR updated<?)",
      )
      .bind(now, salon.id, salon.turn, now, now - 180000)
      .run();
    if (!locked.meta.changes)
      return json({ status: "thinking", turn: salon.turn });
    try {
      const history = (
        await db
          .prepare(
            "SELECT speaker,kind,body,round FROM messages WHERE session=? ORDER BY created,id",
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
          "UPDATE sessions SET engine_state='error',last_error=?,next_at=?,updated=? WHERE id=?",
        )
        .bind(message, Date.now() + 60000, Date.now(), salon.id)
        .run();
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
