import {
  database,
  identity,
  json,
  day,
  input,
  apiError,
  participatory,
} from "@/lib/server";
import { candidates, thinkers } from "@/lib/content";
export async function POST(req: Request) {
  try {
    const user = await identity();
    const b = await input(req);
    const db = database();
    const now = Date.now();
    if (b.action === "new") throw new Error("每日会场由沙龙引擎自动建立。");
    if (b.action === "vote") {
      if (!candidates.some((t) => t.id === b.topic))
        throw new Error("议题不存在。");
      const h = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
      const m = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          minute: "2-digit",
        }).format(new Date()),
      );
      if (h === 23 && m >= 55) throw new Error("今日投票已于 23:55 截止。");
      const r = await db
        .prepare(
          "INSERT INTO votes (id,owner,day,topic) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM votes WHERE owner=? AND day=?)<5",
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          day(),
          b.topic,
          user.userId,
          day(),
        )
        .run();
      if (!r.meta.changes) throw new Error("今天的 5 票已用完，明天再来。");
      return json({ ok: true });
    }
    const s = await participatory(String(b.session || ""), user.userId);
    if (b.action === "question") {
      const body = String(b.body || "").trim();
      if (body.length < 5 || body.length > 500)
        throw new Error("问题请控制在 5–500 字。");
      if (!["host", ...thinkers.map((t) => t.id)].includes(b.target))
        throw new Error("请选择有效的提问对象。");
      if (s.status === "complete")
        throw new Error("本场已结束，请等待明日会场。");
      const id = crypto.randomUUID();
      const inserted = await db
        .prepare(
          "INSERT INTO questions (id,session,owner,body,target,status,created) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM questions WHERE session=?)<100",
        )
        .bind(id, s.id, user.userId, body, b.target, "queued", now, s.id)
        .run();
      if (!inserted.meta.changes) throw new Error("本场问题已达上限。");
      return json({ id });
    }
    if (b.action === "like") {
      const q = await db
        .prepare("SELECT id FROM questions WHERE id=? AND session=?")
        .bind(b.question, s.id)
        .first();
      if (!q) throw new Error("问题不存在。");
      await db
        .prepare(
          "INSERT OR IGNORE INTO likes (id,question,owner) VALUES (?,?,?)",
        )
        .bind(crypto.randomUUID(), q.id, user.userId)
        .run();
      return json({ ok: true });
    }
    throw new Error("不支持的操作。");
  } catch (e) {
    return apiError(e);
  }
}
