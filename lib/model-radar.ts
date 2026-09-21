import { env } from "cloudflare:workers";
import { healthRows, routeId } from "@/lib/free-model-hub";

export type ModelRoute = {
  id: string;
  label: string;
  adapter: "responses" | "chat" | "cloudflare";
  baseUrl: string;
  model: string;
  key: string;
  free: boolean;
  priority: number;
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
};

export type RadarModel = {
  id: string;
  name: string;
  context: number;
  structured: boolean;
};

const providerOffers = [
  {
    id: "minimax",
    label: "MiniMax M2-her",
    credential: "MINIMAX_API_KEY",
    offer: "可选的付费兜底；默认不会自动调用",
    detail:
      "H3 是视频模型；沙龙改用 M2-her 文本对话模型。官方未承诺永久免费，额度用完后按量计费。",
    source: "https://platform.minimax.io/docs/guides/text-chat",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    credential: "OPENROUTER_API_KEY",
    offer: "免费模型路由；未充值账户通常为每日 50 次免费请求",
    detail: "目录会持续变化，系统自动读取零价格模型，并让路由器选择当前可用项。",
    source: "https://openrouter.ai/docs/guides/routing/model-variants/free",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    credential: "GEMINI_API_KEY",
    offer: "部分 Flash 模型提供免费输入与输出额度",
    detail: "需确认项目仍在免费层，并设置 GEMINI_FREE_TIER_CONFIRMED=true；限额随项目变化。",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    id: "groq",
    label: "GroqCloud",
    credential: "GROQ_API_KEY",
    offer: "开发者免费层；按模型设置每日请求与 Token 限额",
    detail: "需确认账户仍在免费层，并设置 GROQ_FREE_TIER_CONFIRMED=true；遇到 429 自动切换。",
    source: "https://console.groq.com/docs/rate-limits",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    credential: "CLOUDFLARE_AI_API_TOKEN",
    offer: "每天 10,000 Neurons 免费额度",
    detail: "需要 Account ID、API Token，并确认免费计划；超出免费配额可能计费。",
    source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow 免费模型",
    credential: "SILICONFLOW_API_KEY",
    offer: "可加入免费小模型轮询",
    detail: "仅在确认当前模型仍为零价格后设置 SILICONFLOW_FREE_CONFIRMED=true；价格可能变化。",
    source: "https://docs.siliconflow.cn/docs/api/chat-completions-post",
  },
  {
    id: "modelscope",
    label: "ModelScope 免费推理",
    credential: "MODELSCOPE_API_KEY",
    offer: "免费推理 API，适合作为实验通道",
    detail: "官方将该服务定位为开发实验；只有确认公开站点使用条件后才启用。",
    source: "https://community.modelscope.cn/675262372db35d1195183bdb.html",
  },
  {
    id: "chatanywhere",
    label: "ChatAnywhere 免费 Key",
    credential: "不接入公开沙龙",
    offer: "该免费 Key 限个人非商业使用",
    detail: "项目说明还将其定位为内部评估测试，不适合作为本站公开自动运行通道。",
    source: "https://github.com/chatanywhere/gpt_api_free",
  },
] as const;

function values() {
  return env as unknown as Record<string, string | undefined>;
}

function manualProvider(baseUrl: string) {
  if (baseUrl.includes("minimax.io")) return "minimax";
  if (baseUrl.includes("deepseek.com")) return "deepseek";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl.includes("groq.com")) return "groq";
  if (baseUrl.includes("googleapis.com")) return "gemini";
  return "openai";
}

export function modelRoutes(): ModelRoute[] {
  const current = values();
  const result: ModelRoute[] = [];
  if (current.MINIMAX_API_KEY)
    result.push({
      id: "minimax",
      label: "MiniMax M2-her",
      adapter: "chat",
      baseUrl: "https://api.minimax.io/v1",
      model: current.MINIMAX_MODEL || "M2-her",
      key: current.MINIMAX_API_KEY,
      free: false,
      priority: 100,
    });
  const manualKey = current.LLM_API_KEY;
  if (manualKey) {
    const baseUrl = (current.LLM_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    const provider = manualProvider(baseUrl);
    result.push({
      id: provider,
      label: provider,
      adapter: current.LLM_API_STYLE === "chat" ? "chat" : "responses",
      baseUrl,
      model:
        current.LLM_MODEL ||
        (provider === "deepseek" ? "deepseek-chat" : "gpt-5.6-luna"),
      key: manualKey,
      free: false,
      priority: 30,
    });
  }
  if (current.OPENROUTER_API_KEY)
    result.push({
      id: "openrouter",
      label: "OpenRouter Free",
      adapter: "chat",
      baseUrl: "https://openrouter.ai/api/v1",
      model: current.OPENROUTER_MODEL || "openrouter/free",
      key: current.OPENROUTER_API_KEY,
      free: (current.OPENROUTER_MODEL || "openrouter/free") === "openrouter/free" || (current.OPENROUTER_MODEL || "").endsWith(":free"),
      priority: 80,
    });
  if (current.GEMINI_API_KEY && current.GEMINI_FREE_TIER_CONFIRMED === "true")
    result.push({
      id: "gemini",
      label: "Google Gemini Free",
      adapter: "chat",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: current.GEMINI_MODEL || "gemini-3.5-flash-lite",
      key: current.GEMINI_API_KEY,
      free: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].includes(current.GEMINI_MODEL || "gemini-3.5-flash-lite"),
      priority: 70,
    });
  if (current.GROQ_API_KEY && current.GROQ_FREE_TIER_CONFIRMED === "true")
    result.push({
      id: "groq",
      label: "GroqCloud Free",
      adapter: "chat",
      baseUrl: "https://api.groq.com/openai/v1",
      model: current.GROQ_MODEL || "openai/gpt-oss-120b",
      key: current.GROQ_API_KEY,
      free: true,
      priority: 60,
    });
  if (current.SILICONFLOW_API_KEY && current.SILICONFLOW_FREE_CONFIRMED === "true")
    result.push({
      id: "siliconflow",
      label: "SiliconFlow 免费模型",
      adapter: "chat",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: current.SILICONFLOW_MODEL || "Qwen/Qwen3-8B",
      key: current.SILICONFLOW_API_KEY,
      free: true,
      priority: 55,
    });
  if (current.MODELSCOPE_API_KEY && current.MODELSCOPE_PUBLIC_USE_CONFIRMED === "true")
    result.push({
      id: "modelscope",
      label: "ModelScope 免费推理",
      adapter: "chat",
      baseUrl: "https://api-inference.modelscope.cn/v1",
      model: current.MODELSCOPE_MODEL || "Qwen/Qwen3-8B",
      key: current.MODELSCOPE_API_KEY,
      free: true,
      priority: 45,
    });
  if (
    current.CLOUDFLARE_AI_API_TOKEN &&
    current.CLOUDFLARE_AI_ACCOUNT_ID &&
    current.CLOUDFLARE_AI_FREE_TIER_CONFIRMED === "true"
  )
    result.push({
      id: "cloudflare",
      label: "Cloudflare Workers AI Free",
      adapter: "cloudflare",
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${current.CLOUDFLARE_AI_ACCOUNT_ID}/ai/run`,
      model: current.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3.8-27b",
      key: current.CLOUDFLARE_AI_API_TOKEN,
      free: true,
      priority: 50,
    });
  if (current.OPENAI_API_KEY)
    result.push({
      id: "openai",
      label: "OpenAI",
      adapter: "responses",
      baseUrl: "https://api.openai.com/v1",
      model: current.OPENAI_MODEL || "gpt-5.6-luna",
      key: current.OPENAI_API_KEY,
      free: false,
      priority: 10,
    });
  return result.filter(
    (route, index, routes) =>
      routes.findIndex(
        (item) =>
          item.id === route.id &&
          item.baseUrl === route.baseUrl &&
          item.model === route.model,
      ) === index,
  );
}

export function selectedRoute() {
  return (
    eligibleRoutes().sort((left, right) => right.priority - left.priority)[0] ??
    null
  );
}

export function eligibleRoutes() {
  const routes = modelRoutes();
  return values().SALON_ALLOW_PAID_FALLBACK === "true" ? routes : routes.filter((route) => route.free);
}

async function fetchOpenRouterModels(): Promise<RadarModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular",
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const data = (await response.json()) as { data?: OpenRouterModel[] };
    return (data.data || [])
      .filter(
        (model) =>
          Boolean(model.id) &&
          (model.id?.endsWith(":free") ||
            (model.pricing?.prompt === "0" &&
              model.pricing?.completion === "0")),
      )
      .slice(0, 12)
      .map((model) => ({
        id: model.id || "",
        name: (model.name || model.id || "").replace(/\s*\(free\)$/i, ""),
        context: Number(model.context_length) || 0,
        structured: Boolean(
          model.supported_parameters?.includes("structured_outputs") ||
            model.supported_parameters?.includes("response_format"),
        ),
      }));
  } finally {
    clearTimeout(timer);
  }
}

export async function modelRadar() {
  const configuredRoutes = modelRoutes();
  const health = await healthRows();
  let models: RadarModel[] = [];
  let catalogOnline = false;
  try {
    models = await fetchOpenRouterModels();
    catalogOnline = models.length > 0;
  } catch {
    // The provider cards remain useful if the public catalog is temporarily down.
  }
  const active = selectedRoute();
  return {
    scannedAt: new Date().toISOString(),
    catalogOnline,
    active: active
      ? { provider: active.id, label: active.label, model: active.model }
      : null,
    providers: providerOffers.map((provider) => {
      const configured = configuredRoutes.some((route) => route.id === provider.id);
      const route = configuredRoutes.find((item) => item.id === provider.id);
      const state = route ? health.find((item) => item.id === routeId(route)) : null;
      return {
        ...provider,
        configured,
        active: active?.id === provider.id,
        lastStatus: state?.last_status || (configured ? "ready" : "unconfigured"),
        retryAt: state?.retry_at || 0,
        lastSuccess: state?.last_success || 0,
        cooling: Boolean(state && state.retry_at > Date.now()),
      };
    }),
    freeModels: models,
    policy: [
      "默认只使用已配置的免费模型，不自动消耗付费额度",
      "按最近成功时间轮换，失败或限流后进入冷却",
      "只有明确启用 SALON_ALLOW_PAID_FALLBACK 才尝试付费通道",
      "每轮只生成一次，再按发言顺序释放",
    ],
  };
}
