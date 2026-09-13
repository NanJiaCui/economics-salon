import { apiError, database, json } from "@/lib/server";
import {
  currentTurn,
  ensureCurrentSalon,
  generateTurn,
  intervalMs,
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
      ).results;
      const question =
        turn.speaker === "host"
          ? await db
              .prepare(
                "SELECT q.*,COUNT(l.id) AS votes FROM questions q LEFT JOIN likes l ON l.question=q.id WHERE q.session=? AND q.status='queued' GROUP BY q.id ORDER BY votes DESC,q.created ASC LIMIT 1",
              )
              .bind(salon.id)
              .first<Record<string, unknown>>()
          : null;
      const body = await generateTurn(salon, turn, question, history);
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO messages (id,session,round,speaker,kind,body,created) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          salon.id,
          turn.round,
          turn.speaker,
          turn.kind || "",
          body,
          Date.now(),
        )
        .run();
      if (question)
        await db
          .prepare("UPDATE questions SET status='included' WHERE id=?")
          .bind(question.id)
          .run();
      const nextTurn = Number(salon.turn) + 1;
      const complete = nextTurn >= schedule.length;
      const nextAt = complete ? 0 : Date.now() + intervalMs(String(salon.mode));
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
