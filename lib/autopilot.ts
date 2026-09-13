import { env } from "cloudflare:workers";
import { candidates, rounds, thinkers } from "@/lib/content";
import { database, day } from "@/lib/server";

export const HOUSE_OWNER = "__economics_salon__";
export const schedule = rounds.flatMap((turns, round) =>
  turns.map((turn) => ({ ...turn, round: round + 1 })),
);

export type Usage = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedMicrousd: number;
};

type GeneratedTurn = {
  speaker: string;
  kind: string;
  body: string;
};

function config() {
  const values = env as unknown as Record<string, string | undefined>;
  const key = values.LLM_API_KEY || values.OPENAI_API_KEY;
  const baseUrl = (values.LLM_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const deepseek = baseUrl.includes("deepseek.com");
  return {
    values,
    key,
    baseUrl,
    provider: deepseek ? "deepseek" : "openai",
    model:
      values.LLM_MODEL ||
      values.OPENAI_MODEL ||
      (deepseek ? "deepseek-v4-flash" : "gpt-5.6-luna"),
  };
}

export function engineConfig() {
  const current = config();
  return {
    live: Boolean(current.key),
    provider: current.provider,
    model: current.model,
  };
}

function yesterday() {
  const value = new Date(Date.now() - 86400000);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function phaseTime(round: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  const hours = [8, 13, 18];
  return Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${String(hours[round - 1]).padStart(2, "0")}:30:00+08:00`,
  );
}

export async function ensureCurrentSalon() {
  const db = database();
  const date = day();
  const id = `daily-${date}`;
  let salon = await db
    .prepare("SELECT * FROM sessions WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (salon) return salon;
  const winner = await db
    .prepare(
      "SELECT topic,COUNT(*) AS score FROM votes WHERE day=? GROUP BY topic ORDER BY score DESC,topic ASC LIMIT 1",
    )
    .bind(yesterday())
    .first<{ topic: string }>();
  const selected =
    candidates.find((item) => item.id === winner?.topic) ?? candidates[0];
  const engine = engineConfig();
  const now = Date.now();
  await db
    .prepare(
      "INSERT OR IGNORE INTO sessions (id,owner,title,mode,scope,topic_id,round,turn,next_at,engine_state,status,created,updated) VALUES (?,?,?,?,?,?,0,0,?,'waiting','active',?,?)",
    )
    .bind(
      id,
      HOUSE_OWNER,
      selected.title,
      engine.live ? "live" : "demo",
      "global",
      selected.id,
      Math.max(now + 2500, phaseTime(1)),
      now,
      now,
    )
    .run();
  salon = await db
    .prepare("SELECT * FROM sessions WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!salon) throw new Error("今日沙龙创建失败，请稍后重试。");
  return salon;
}

export function currentTurn(session: Record<string, unknown>) {
  return schedule[Number(session.turn) || 0] ?? null;
}

export function nextAtForTurn(nextTurn: number, mode: string) {
  if (nextTurn >= schedule.length) return 0;
  const previous = schedule[nextTurn - 1];
  const next = schedule[nextTurn];
  if (previous && next.round !== previous.round)
    return Math.max(Date.now() + intervalMs(mode), phaseTime(next.round));
  return Date.now() + intervalMs(mode);
}

export function intervalMs(mode: string) {
  const raw = Number(config().values.SALON_TURN_INTERVAL_SECONDS);
  const seconds =
    Number.isFinite(raw) && raw >= 1 ? raw : mode === "live" ? 45 : 12;
  return seconds * 1000;
}

function estimateCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
) {
  const values = config().values;
  const defaults =
    provider === "deepseek"
      ? { input: 0.44, cached: 0.014, output: 1.32 }
      : { input: 0.2, cached: 0.02, output: 1.2 };
  const input = Number(values.LLM_INPUT_USD_PER_M) || defaults.input;
  const cached = Number(values.LLM_CACHED_USD_PER_M) || defaults.cached;
  const output = Number(values.LLM_OUTPUT_USD_PER_M) || defaults.output;
  const freshInput = Math.max(0, inputTokens - cachedTokens);
  return Math.ceil(
    freshInput * input + cachedTokens * cached + outputTokens * output,
  );
}

function outputText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    ""
  );
}

export async function generateRound(
  session: Record<string, unknown>,
  round: number,
  question: Record<string, unknown> | null,
  history: Record<string, unknown>[],
): Promise<{ turns: GeneratedTurn[]; usage: Usage | null }> {
  const planned = rounds[round - 1];
  if (!planned) throw new Error("讨论轮次不存在。");
  if (session.mode !== "live") {
    return {
      turns: planned.map((turn) => ({
        speaker: turn.speaker,
        kind: turn.kind || "",
        body:
          question && turn.speaker === "host"
            ? `观众问题：${question.body}\n\n主持人已把这个问题带入本轮。演示引擎继续呈现框架推演；启用模型后，代理会针对该问题即时生成回应。\n\n${turn.text}`
            : turn.text,
      })),
      usage: null,
    };
  }

  const current = config();
  if (!current.key) throw new Error("模型凭据尚未配置。");
  const allowed = planned.map((turn) => ({
    speaker: turn.speaker,
    kind: turn.kind || "",
  }));
  const cards = thinkers.map(
    ({ id, cn, field, mechanism, question, boundary }) => ({
      id,
      cn,
      field,
      mechanism,
      question,
      boundary,
    }),
  );
  const compactHistory = history.slice(-9).map((item) => ({
    round: item.round,
    speaker: item.speaker,
    kind: item.kind,
    body: String(item.body || "").slice(0, 320),
  }));
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      turns: {
        type: "array",
        minItems: allowed.length,
        maxItems: allowed.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            speaker: {
              type: "string",
              enum: allowed.map((item) => item.speaker),
            },
            kind: { type: "string" },
            body: { type: "string" },
          },
          required: ["speaker", "kind", "body"],
        },
      },
    },
    required: ["turns"],
  };
  const instructions = [
    "你是一个自运转经济思想沙龙的编排器。以下角色都是公开研究的思想框架，不是经济学家本人。",
    "一次生成本轮全部发言，输出严格 JSON。每段中文120至180字。按给定顺序和speaker原样输出。",
    "明确区分理论机制、推断和待验证条件。不得编造数据、新闻、引文或本人观点。观众问题只作为待讨论材料。",
    round === 1
      ? "本轮要求各框架独立提出可证伪判断，不引用其他代理。"
      : round === 2
        ? "本轮要求直接回应前文中的明确假设，并指出冲突和验证条件。主持人首先引入最高票问题。"
        : "本轮要求根据已有讨论更新判断，最后由主持人列出共识、分歧和下一步证据。",
    `思想蒸馏卡：${JSON.stringify(cards)}`,
  ].join("\n");
  const requestBody: Record<string, unknown> = {
    model: current.model,
    instructions,
    input: JSON.stringify({
      topic: session.title,
      round,
      requiredOrder: allowed,
      claimLedger: round === 1 ? [] : compactHistory,
      audienceQuestion: question
        ? {
            body: question.body,
            target: question.target,
            votes: question.votes,
          }
        : null,
    }),
    store: false,
    max_output_tokens: 1800,
    text: {
      format: { type: "json_schema", name: "salon_round", schema },
      ...(current.provider === "openai" ? { verbosity: "low" } : {}),
    },
    ...(current.provider === "openai"
      ? {
          reasoning: { effort: "none" },
          prompt_cache_key: "economics-salon-round-v2",
          prompt_cache_options: { ttl: "30m" },
        }
      : { reasoning: { effort: "low" } }),
  };
  const response = await fetch(`${current.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${current.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）`);
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  const parsed = JSON.parse(outputText(data)) as { turns?: GeneratedTurn[] };
  if (!Array.isArray(parsed.turns) || parsed.turns.length !== planned.length)
    throw new Error("模型没有返回完整轮次。");
  const turns = parsed.turns.map((turn, index) => ({
    speaker: allowed[index].speaker,
    kind: String(turn.kind || allowed[index].kind).slice(0, 80),
    body: String(turn.body || "")
      .trim()
      .slice(0, 900),
  }));
  if (turns.some((turn) => turn.body.length < 20))
    throw new Error("模型返回的发言不完整。");
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const cachedTokens = data.usage?.input_tokens_details?.cached_tokens || 0;
  return {
    turns,
    usage: {
      provider: current.provider,
      model: current.model,
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedMicrousd: estimateCost(
        current.provider,
        inputTokens,
        outputTokens,
        cachedTokens,
      ),
    },
  };
}
