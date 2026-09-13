import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database, json, day, apiError } from "@/lib/server";
import { env } from "cloudflare:workers";
import { ensureCurrentSalon, schedule } from "@/lib/autopilot";
export async function GET(req: Request) {
  try {
    const user = await getChatGPTUser();
    const db = database();
    const today = await ensureCurrentSalon();
    const all = await db
      .prepare(
        "SELECT * FROM sessions WHERE scope='global' ORDER BY created DESC LIMIT 30",
      )
      .all();
    const wanted = new URL(req.url).searchParams.get("session");
    const current = wanted
      ? (all.results.find((x) => x.id === wanted) ?? today)
      : today;
    const msgs = (
      await db
        .prepare("SELECT * FROM messages WHERE session=? ORDER BY created,id")
        .bind(current.id)
        .all()
    ).results;
    const qs = (
      await db
        .prepare(
          "SELECT q.*,COUNT(l.id) AS votes,MAX(CASE WHEN l.owner=? THEN 1 ELSE 0 END) AS liked FROM questions q LEFT JOIN likes l ON l.question=q.id WHERE q.session=? GROUP BY q.id ORDER BY votes DESC,q.created ASC",
        )
        .bind(user?.userId ?? "", current.id)
        .all()
    ).results;
    const v = await db
      .prepare(
        "SELECT topic,COUNT(*) AS votes,COUNT(DISTINCT owner) AS people FROM votes WHERE day=? GROUP BY topic",
      )
      .bind(day())
      .all();
    const used = user
      ? await db
          .prepare("SELECT COUNT(*) AS n FROM votes WHERE owner=? AND day=?")
          .bind(user.userId, day())
          .first<{ n: number }>()
      : null;
    const mode = (env as unknown as Record<string, string | undefined>)
      .OPENAI_API_KEY
      ? "live"
      : "demo";
    return json({
      user: user ? { name: user.displayName } : null,
      mode,
      session: current,
      sessions: all.results,
      messages: msgs,
      questions: qs,
      votes: v.results,
      remaining: user ? Math.max(0, 5 - (used?.n || 0)) : 5,
      engine: {
        state: current.engine_state,
        turn: Number(current.turn) || 0,
        total: schedule.length,
        nextAt: Number(current.next_at) || null,
        lastError: current.last_error,
        currentSpeaker: schedule[Number(current.turn) || 0]?.speaker ?? null,
        currentKind: schedule[Number(current.turn) || 0]?.kind ?? null,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
