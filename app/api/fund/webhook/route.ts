import { env } from "cloudflare:workers";
import { apiError, database, json } from "@/lib/server";

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function equalHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1)
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

async function verifyStripe(
  payload: string,
  signature: string,
  secret: string,
) {
  const fields = signature
    .split(",")
    .reduce<Record<string, string[]>>((result, field) => {
      const [key, value] = field.split("=", 2);
      if (key && value) (result[key] ||= []).push(value);
      return result;
    }, {});
  const timestamp = Number(fields.t?.[0]);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = bytesToHex(digest);
  return (fields.v1 || []).some((value) => equalHex(value, expected));
}

export async function POST(request: Request) {
  try {
    const values = env as unknown as Record<string, string | undefined>;
    const secret = values.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("赞助支付回调尚未配置。");
    const payload = await request.text();
    if (payload.length > 100000) throw new Error("支付回调内容过长。");
    const signature = request.headers.get("stripe-signature") || "";
    if (!(await verifyStripe(payload, signature, secret)))
      throw new Error("支付回调签名无效。");
    const event = JSON.parse(payload) as {
      id?: string;
      type?: string;
      data?: {
        object?: {
          amount_total?: number;
          currency?: string;
          payment_status?: string;
        };
      };
    };
    if (event.type !== "checkout.session.completed")
      return json({ received: true });
    const payment = event.data?.object;
    if (
      !event.id ||
      payment?.payment_status !== "paid" ||
      !Number.isInteger(payment.amount_total) ||
      Number(payment.amount_total) <= 0 ||
      !payment.currency
    )
      throw new Error("支付回调缺少有效的到账信息。");
    await database()
      .prepare(
        "INSERT OR IGNORE INTO funding_events (id,provider,provider_event,amount_minor,currency,supporter,status,created) VALUES (?,?,?,?,?,NULL,'completed',?)",
      )
      .bind(
        crypto.randomUUID(),
        "stripe",
        event.id,
        payment.amount_total,
        payment.currency.toUpperCase(),
        Date.now(),
      )
      .run();
    return json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
