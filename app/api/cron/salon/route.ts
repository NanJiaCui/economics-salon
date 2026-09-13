import { env } from "cloudflare:workers";
import { POST as advanceSalon } from "@/app/api/autopilot/route";
import { json } from "@/lib/server";

function same(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1)
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

export async function POST(request: Request) {
  const secret = (env as unknown as Record<string, string | undefined>)
    .SALON_CRON_SECRET;
  const supplied = request.headers.get("authorization") || "";
  if (!secret || !same(supplied, `Bearer ${secret}`))
    return json({ error: "Unauthorized" }, 401);
  return advanceSalon();
}
