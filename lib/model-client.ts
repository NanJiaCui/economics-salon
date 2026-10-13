import { env } from 'cloudflare:workers';
import { eligibleRoutes, type ModelRoute } from './model-radar';
import { availableRoutes, healthRows, recordRouteFailure, recordRouteSuccess, ModelRequestError } from './free-model-hub';
export type ModelUsage = { provider: string; model: string; inputTokens: number; outputTokens: number; cachedTokens: number; estimatedMicrousd: number };
export class ModelUnavailableError extends Error {
  constructor(public retryAt: number, public usages: ModelUsage[] = []) { super('免费模型暂不可用，已保存进度，等待自动重试。'); }
}
export function modelJson(text: string): Record<string, unknown> {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || clean;
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('模型没有返回有效 JSON');
  const value = JSON.parse(source.slice(start, end + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError('模型输出格式错误');
  return value;
}
async function request(route: ModelRoute, instructions: string, payload: unknown, schema: Record<string, unknown>, maxTokens: number) {
  const headers: Record<string, string> = { Authorization: `Bearer ${route.key}`, 'Content-Type': 'application/json' };
  if (route.id === 'openrouter') { headers['HTTP-Referer'] = 'https://economics-salon-yfcui.jijicyf.chatgpt.site'; headers['X-Title'] = 'China Economics Salon'; }
  const messages = [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(payload) }];
  let url = `${route.baseUrl}/chat/completions`;
  let body: Record<string, unknown> = { model: route.model, messages, max_tokens: maxTokens, temperature: .5 };
  if (route.id === 'openrouter') body.reasoning = { effort: 'none', exclude: true };
  if (route.id === 'minimax') { delete body.max_tokens; body.max_completion_tokens = maxTokens; body.temperature = 1; }
  if (route.adapter === 'cloudflare') { url = `${route.baseUrl}/${route.model}`; body = { messages, max_tokens: maxTokens, response_format: { type: 'json_schema', json_schema: schema } }; }
  if (route.adapter === 'responses') { url = `${route.baseUrl}/responses`; body = { model: route.model, instructions, input: JSON.stringify(payload), store: false, max_output_tokens: maxTokens, text: { format: { type: 'json_schema', name: 'salon_output', schema } } }; }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(35000) });
  if (!response.ok) {
    let detail=''; try { const failure=await response.json() as {error?:{message?:string}}; detail=String(failure.error?.message || '').replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').slice(0,240); }catch{}
    console.warn('Salon model response',route.model,response.status,detail);
    throw new ModelRequestError(`${route.label} 请求失败（${response.status}）：${detail}`,response.status,Number(response.headers.get('retry-after')) || 0);
  }
  const data = await response.json() as {
    model?: string; choices?: { message?: { content?: string } }[]; output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
    result?: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; input_tokens_details?: { cached_tokens?: number }; cost?: number };
  };
  const text = data.choices?.[0]?.message?.content || data.result?.response || data.output_text || data.output?.flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text || '').join('') || '';
  const u = data.usage || data.result?.usage || {};
  const input = Number('input_tokens' in u ? u.input_tokens : u.prompt_tokens) || 0;
  const output = Number('output_tokens' in u ? u.output_tokens : u.completion_tokens) || 0;
  const cached = data.usage?.prompt_tokens_details?.cached_tokens || data.usage?.input_tokens_details?.cached_tokens || 0;
  const prices = env as unknown as Record<string, string | undefined>;
  return { text, usage: { provider: route.id, model: data.model || route.model, inputTokens: input, outputTokens: output, cachedTokens: cached,
    estimatedMicrousd: route.free ? 0 : Math.ceil(input * (Number(prices.LLM_INPUT_USD_PER_M) || .2) + output * (Number(prices.LLM_OUTPUT_USD_PER_M) || 1.2)) } satisfies ModelUsage };
}
export async function callModelJson<T>(instructions: string, payload: unknown, schema: Record<string, unknown>, maxTokens: number, validate: (raw: Record<string, unknown>) => T) {
  const usages: ModelUsage[] = [];
  const routes = await availableRoutes(eligibleRoutes());
  let calls = 0;
  for (const route of routes) {
    for (let attempt = 0; attempt < 2 && calls < 3; attempt++) {
      try {
        calls++;
        const reply = await request(route, instructions, payload, schema, maxTokens);
        usages.push(reply.usage);
        const value = validate(modelJson(reply.text));
        await recordRouteSuccess(route);
        return { value, usages };
      } catch (error) {
        // Retry malformed output once; transport errors and quotas use the Hub's cooldown.
        if (attempt === 0 && !(error instanceof ModelRequestError) && !(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name))) continue;
        await recordRouteFailure(route, error);
        break;
      }
    }
    if (calls >= 3) break;
  }
  const health = await healthRows();
  const future = health.filter(x => x.retry_at > Date.now()).map(x => x.retry_at);
  throw new ModelUnavailableError(future.length ? Math.min(...future) : Date.now() + 60000, usages);
}
