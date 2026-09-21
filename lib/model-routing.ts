import type { ModelRoute } from "@/lib/model-radar";

export type RouteHealth = {
  id: string; provider: string; model: string; failure_count: number;
  retry_at: number; last_success: number; last_status: string; updated: number;
};

export class ModelRequestError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds = 0) { super(message); }
}

export function routeId(route: ModelRoute) { return `${route.id}:${route.model}`; }

export function rankRoutes(routes: ModelRoute[], rows: RouteHealth[], now = Date.now()) {
  const health = new Map(rows.map((row) => [row.id, row]));
  return routes.filter((route) => (health.get(routeId(route))?.retry_at || 0) <= now)
    .sort((left, right) => {
      if (left.free !== right.free) return left.free ? -1 : 1;
      const a = health.get(routeId(left))?.last_success || 0;
      const b = health.get(routeId(right))?.last_success || 0;
      return a - b || right.priority - left.priority;
    });
}

export function retryDelay(error: unknown, failures: number) {
  if (error instanceof ModelRequestError) {
    if ([401, 402, 403].includes(error.status)) return 24 * 60 * 60 * 1000;
    if (error.status === 429) return Math.max(60, Math.min(3600, error.retryAfterSeconds || 1800)) * 1000;
    if (error.status === 400 || error.status === 404) return 60 * 60 * 1000;
  }
  return Math.min(30 * 60 * 1000, 60_000 * 2 ** Math.min(5, failures));
}
