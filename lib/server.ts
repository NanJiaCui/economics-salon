import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export function database() {
  if (!env.DB) throw new Error("会场存储暂时不可用，请稍后重试。");
  return env.DB;
}
export async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("请先登录后参与沙龙。");
  return user;
}
export function day() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function input(req: Request) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    throw new Error("请求来源不受支持。");
  const txt = await req.text();
  if (txt.length > 8000) throw new Error("内容过长。");
  return JSON.parse(txt);
}
export function apiError(e: unknown) {
  const message = e instanceof Error ? e.message : "请求失败，请稍后重试。";
  console.error("Salon API:", message);
  return json(
    {
      error: message.includes("登录")
        ? message
        : message.includes("SQLITE")
          ? "会场存储暂时不可用，请稍后重试。"
          : message,
    },
    message.includes("登录") ? 401 : 400,
  );
}
export async function owned(id: string, owner: string) {
  const s = await database()
    .prepare("SELECT * FROM sessions WHERE id=? AND owner=?")
    .bind(id, owner)
    .first();
  if (!s) throw new Error("找不到这场沙龙。");
  return s;
}
export async function participatory(id: string, owner: string) {
  const s = await database()
    .prepare(
      "SELECT * FROM sessions WHERE id=? AND (owner=? OR scope='global')",
    )
    .bind(id, owner)
    .first();
  if (!s) throw new Error("找不到这场沙龙。");
  return s;
}
