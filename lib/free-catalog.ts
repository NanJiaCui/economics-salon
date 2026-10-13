import type { ModelRoute } from './model-radar';
type CatalogModel = { id: string; pricing?: Record<string, string>; architecture?: { output_modalities?: string[] }; description?: string };
let cache: { at: number; models: CatalogModel[] } | null = null;
export function isFreeTextModel(m: CatalogModel) {
  const prices = m.pricing || {};
  return prices.prompt !== undefined && prices.completion !== undefined && Object.values(prices).every(x => Number(x) === 0) &&
    m.architecture?.output_modalities?.length === 1 && m.architecture.output_modalities[0] === 'text' &&
    !/safety|guard|moderation|embedding|lyria|laguna|north-mini-code|openrouter\/free/i.test(m.id);
}
export async function freeOpenRouterRoutes(route: ModelRoute): Promise<ModelRoute[]> {
  try {
    if (!cache || Date.now() - cache.at > 300000) {
      const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('catalog unavailable');
      const body = await response.json() as { data?: CatalogModel[] };
      cache = { at: Date.now(), models: (body.data || []).filter(isFreeTextModel) };
    }
    const preference = (id: string) => id === route.model ? 0 : /inclusionai\/ling/.test(id) ? 1 : /google\/gemma.*-it/.test(id) ? 2 : /dots-studio/.test(id) ? 3 : /thinkingmachines.*small/.test(id) ? 4 : 10;
    return [...cache.models].sort((a,b) => preference(a.id) - preference(b.id)).slice(0, 3).map((m,index) => ({ ...route, model: m.id, priority: route.priority - index, free: true }));
  } catch { return []; } // Unknown current price must never open a paid route.
}
