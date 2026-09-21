import { chooseNext } from "@/lib/discussion";
import { discussionContext } from "@/lib/discussion-store";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database, json, day, apiError } from "@/lib/server";
import { env } from "cloudflare:workers";
import { engineConfig, ensureCurrentSalon, schedule } from "@/lib/autopilot";
import { ensureDailyAgenda, parseAgendaContext } from "@/lib/agenda";
import { parseResearch } from "@/lib/research";
export async function GET(req: Request) {
  try {
    const user = await getChatGPTUser();
    const db = database();
    const today = await ensureCurrentSalon();
    const agenda = await ensureDailyAgenda(db);
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
    const context = await discussionContext(current, msgs);
    const planned = current.mode === "demo" ? chooseNext(context.history, context.category, Number(current.turn)) : null;
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
    const [fundingRows, usage] = await Promise.all([
      db
        .prepare(
          "SELECT currency,SUM(amount_minor) AS amount,COUNT(*) AS payments FROM funding_events WHERE status='completed' GROUP BY currency ORDER BY currency",
        )
        .all(),
      db
        .prepare(
          "SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(cached_tokens),0) AS cached_tokens,COALESCE(SUM(estimated_microusd),0) AS estimated_microusd,COUNT(*) AS calls FROM usage_events",
        )
        .first<Record<string, number>>(),
    ]);
    const engineConfigValue = engineConfig();
    const topicContext = parseAgendaContext(current.topic_context);
    const paymentCandidate = (
      env as unknown as Record<string, string | undefined>
    ).SPONSOR_PAYMENT_URL;
    const paymentUrl =
      paymentCandidate && /^https:\/\//.test(paymentCandidate)
        ? paymentCandidate
        : null;
    return json({
      user: user ? { name: user.displayName } : null,
      mode: current.mode,
      session: current,
      sessions: all.results,
      messages: context.history,
      discussion: context.discussion,
      questions: qs,
      votes: v.results,
      candidates: agenda,
      topicSources: topicContext.sources || [],
      research: parseResearch(topicContext.research),
      agenda: {
        collectedAt: agenda[0]?.day || day(),
        generationMode: agenda[0]?.generationMode || "source-rules",
        categories: [...new Set(agenda.map((item) => item.tag))],
      },
      remaining: user ? Math.max(0, 5 - (used?.n || 0)) : 5,
      funding: {
        totals: fundingRows.results,
        supporters: fundingRows.results.reduce(
          (sum, row) => sum + Number(row.payments || 0),
          0,
        ),
        usage: usage || {
          input_tokens: 0,
          output_tokens: 0,
          cached_tokens: 0,
          estimated_microusd: 0,
          calls: 0,
        },
        paymentUrl,
        paymentReady: Boolean(paymentUrl),
      },
      engine: {
        state: current.engine_state,
        turn: Number(current.turn) || 0,
        total: schedule.length,
        nextAt: Number(current.next_at) || null,
        lastError: current.last_error,
        currentSpeaker: planned?.speaker ?? schedule[Number(current.turn) || 0]?.speaker ?? null,
        reason: planned?.reason || null,
        currentKind: planned?.action ?? schedule[Number(current.turn) || 0]?.kind ?? null,
        provider: engineConfigValue.provider,
        model: engineConfigValue.live ? engineConfigValue.model : null,
        phases: ["08:30", "13:30", "18:30"],
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
