import { env } from "cloudflare:workers";
import { rounds, thinkers } from "@/lib/content";
import {
  agendaContext,
  ensureDailyAgenda,
  getAgenda,
  parseAgendaContext,
} from "@/lib/agenda";
import { generateDemoRound } from "@/lib/demo-dialogue";
import { modelRoutes, selectedRoute, type ModelRoute } from "@/lib/model-radar";
import { database, day } from "@/lib/server";
import { collectResearch } from "@/lib/research";

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
  const route = selectedRoute();
  return {
    values,
    key: route?.key,
    baseUrl: route?.baseUrl || "",
    provider: route?.id || "model-radar",
    model: route?.model || "等待免费通道",
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
  if (salon) {
    return salon;
  }
  const dailyAgenda = await ensureDailyAgenda(db, date);
  const winner = await db
    .prepare(
      "SELECT topic,COUNT(*) AS score FROM votes WHERE day=? GROUP BY topic ORDER BY score DESC,topic ASC LIMIT 1",
    )
    .bind(yesterday())
    .first<{ topic: string }>();
  const previousAgenda = winner?.topic ? await getAgenda(db, yesterday()) : [];
  const selected =
    previousAgenda.find((item) => item.id === winner?.topic) ?? dailyAgenda[0];
  if (!selected) throw new Error("今日议题采集尚未完成，请稍后重试。");
  const research = await collectResearch(selected.sources);
  const engine = engineConfig();
  const now = Date.now();
  const mode = engine.live ? "live" : "demo";
  await db
    .prepare(
      "INSERT OR IGNORE INTO sessions (id,owner,title,mode,scope,topic_id,topic_context,round,turn,next_at,engine_state,status,created,updated) VALUES (?,?,?,?,?,?,?,0,0,?,'waiting','active',?,?)",
    )
    .bind(
      id,
      HOUSE_OWNER,
      selected.title,
      mode,
      "global",
      selected.id,
      JSON.stringify({ ...JSON.parse(agendaContext(selected)), research }),
      mode === "demo" ? now + 2500 : Math.max(now + 2500, phaseTime(1)),
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
  free = false,
) {
  if (free) return 0;
  const values = config().values;
  const defaults =
    provider === "deepseek"
      ? { input: 0.44, cached: 0.014, output: 1.32 }
      : provider === "minimax"
        ? { input: 0.3, cached: 0.3, output: 1.2 }
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

function parseModelJson(text: string) {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || withoutThinking;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回有效 JSON");
  return JSON.parse(source.slice(start, end + 1)) as { turns?: GeneratedTurn[] };
}

type ModelReply = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

async function requestModel(
  route: ModelRoute,
  instructions: string,
  payload: Record<string, unknown>,
  schema: Record<string, unknown>,
): Promise<ModelReply> {
  const commonHeaders: Record<string, string> = {
    Authorization: `Bearer ${route.key}`,
    "Content-Type": "application/json",
  };
  if (route.id === "openrouter") {
    commonHeaders["HTTP-Referer"] = "https://economics-salon-yfcui.jijicyf.chatgpt.site";
    commonHeaders["X-Title"] = "Economics Salon";
  }
  if (route.adapter === "cloudflare") {
    const response = await fetch(`${route.baseUrl}/${route.model}`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(payload) },
        ],
        max_tokens: 1800,
        temperature: 0.45,
        response_format: { type: "json_schema", json_schema: schema },
      }),
    });
    if (!response.ok)
      throw new Error(`${route.label} 请求失败（${response.status}）`);
    const data = (await response.json()) as {
      success?: boolean;
      result?: {
        response?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
        };
      };
    };
    if (data.success === false) throw new Error(`${route.label} 返回失败状态`);
    return {
      text: data.result?.response || "",
      inputTokens: data.result?.usage?.prompt_tokens || 0,
      outputTokens: data.result?.usage?.completion_tokens || 0,
      cachedTokens: 0,
    };
  }
  if (route.adapter === "chat") {
    const responseFormat =
      route.id === "minimax"
        ? {}
        : {
            response_format: {
              type: "json_schema",
              json_schema: { name: "salon_round", strict: true, schema },
            },
          };
    const response = await fetch(`${route.baseUrl}/chat/completions`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        model: route.model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(payload) },
        ],
        ...(route.id === "minimax"
          ? { max_completion_tokens: 1800, temperature: 1, top_p: 0.95 }
          : { max_tokens: 1800, temperature: 0.45 }),
        ...responseFormat,
      }),
    });
    if (!response.ok)
      throw new Error(`${route.label} 请求失败（${response.status}）`);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    return {
      text: data.choices?.[0]?.message?.content || "",
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens || 0,
    };
  }
  const response = await fetch(`${route.baseUrl}/responses`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      model: route.model,
      instructions,
      input: JSON.stringify(payload),
      store: false,
      max_output_tokens: 1800,
      text: {
        format: { type: "json_schema", name: "salon_round", schema },
        ...(route.id === "openai" ? { verbosity: "low" } : {}),
      },
      ...(route.id === "openai"
        ? {
            reasoning: { effort: "none" },
            prompt_cache_key: "economics-salon-dialogue-v4",
            prompt_cache_options: { ttl: "30m" },
          }
        : { reasoning: { effort: "low" } }),
    }),
  });
  if (!response.ok)
    throw new Error(`${route.label} 请求失败（${response.status}）`);
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  return {
    text: outputText(data),
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    cachedTokens: data.usage?.input_tokens_details?.cached_tokens || 0,
  };
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
      turns: generateDemoRound(
        String(session.topic_id || ""),
        String(session.title || ""),
        round,
        question,
        session.topic_context,
      ),
      usage: null,
    };
  }

  const routes = modelRoutes().sort(
    (left, right) => right.priority - left.priority,
  );
  if (!routes.length) throw new Error("模型凭据尚未配置。");
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
  const agenda = parseAgendaContext(session.topic_context);
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
    "虽然一次批量输出整轮，但必须在内部按真实对话顺序推演：生成第N段时，把本轮第N-1段和此前观点账本视为已经说过的话。不得把各角色写成互不相干的平行短评。",
    "每段发言都完成三个动作：明确承接主持人或某位已发言者的具体观点；用本角色蒸馏卡增加一个新的机制、边界或反例；留下一个可由下一位回应的追问或验证条件。正文要自然连贯，不使用机械小标题。",
    "承接必须具体到前文的一个主张，不能只写“我同意”“我补充”。新增内容必须来自该角色的mechanism、question或boundary，不得借用别人的身份口吻。",
    "明确区分理论机制、推断和待验证条件。不得编造数据、新闻、引文或本人观点。观众问题只作为待讨论材料。",
    "议题材料只提供标题与来源线索。引用时说清楚‘材料标题显示什么’，不得把未阅读全文的标题扩写成事实；论据可来自思想蒸馏卡的机制或材料中明确给出的信息。",
    "保持角色连续性：同一角色再次发言时，先说明前文判断因哪条新信息而保持、收缩或改变，再给出新的结论。不同角色不能说成同一套观点。",
    round === 1
      ? "本轮首位承接主持人的议题设定，其余角色必须承接本轮已经出现的一个判断，再提出自己的可证伪增量。"
      : round === 2
        ? "本轮由主持人先综合前文并引入最高票问题；之后每位角色必须点名回应或质询一个已经出现的假设，并给出冲突与验证条件。"
        : "本轮由主持人提出共同情景；之后每位角色说明前文哪个判断因此需要保留、收缩或推翻，最后由主持人综合共识、分歧和下一步证据。",
    `思想蒸馏卡：${JSON.stringify(cards)}`,
  ].join("\n");
  const payload = {
    topic: session.title,
    topicCategory: agenda.category || null,
    topicTension: agenda.tension || null,
    agendaEvidence: (agenda.sources || []).slice(0, 5),
    round,
    requiredOrder: allowed,
    hostGuidance:
      "请围绕当前议题持续对话。每位发言者要承接已出现的具体主张，并用自己的理论卡推动讨论向可验证条件前进。",
    claimLedger: compactHistory,
    audienceQuestion: question
      ? {
          body: question.body,
          target: question.target,
          votes: question.votes,
        }
      : null,
  };
  const failures: string[] = [];
  for (const route of routes) {
    try {
      const reply = await requestModel(route, instructions, payload, schema);
      const parsed = parseModelJson(reply.text);
      if (!Array.isArray(parsed.turns) || parsed.turns.length !== planned.length)
        throw new Error("没有返回完整轮次");
      const turns = parsed.turns.map((turn, index) => ({
        speaker: allowed[index].speaker,
        kind: String(turn.kind || allowed[index].kind).slice(0, 80),
        body: String(turn.body || "")
          .trim()
          .slice(0, 900),
      }));
      if (turns.some((turn) => turn.body.length < 20))
        throw new Error("返回的发言不完整");
      return {
        turns,
        usage: {
          provider: route.id,
          model: route.model,
          inputTokens: reply.inputTokens,
          outputTokens: reply.outputTokens,
          cachedTokens: reply.cachedTokens,
          estimatedMicrousd: estimateCost(
            route.id,
            reply.inputTokens,
            reply.outputTokens,
            reply.cachedTokens,
            route.free,
          ),
        },
      };
    } catch (error) {
      failures.push(
        `${route.label}: ${error instanceof Error ? error.message : "失败"}`,
      );
    }
  }
  throw new Error(`所有已配置模型暂不可用：${failures.join("；")}`);
}
