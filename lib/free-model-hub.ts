import type { ModelRoute } from "@/lib/model-radar";
import { database } from "@/lib/server";
import { ModelRequestError, rankRoutes, retryDelay, routeId, type RouteHealth } from "@/lib/model-routing";
export { ModelRequestError, rankRoutes, retryDelay, routeId } from "@/lib/model-routing";

export async function healthRows(): Promise<RouteHealth[]> {
  try {
    const result = await database().prepare("SELECT * FROM model_route_health").all<RouteHealth>();
    return result.results;
  } catch {
    // The hub can still route while a deployment is applying its migration.
    return [];
  }
}

export async function availableRoutes(routes: ModelRoute[]) {
  return rankRoutes(routes, await healthRows());
}

export async function recordRouteSuccess(route: ModelRoute) {
  const now = Date.now();
  try {
    await database().prepare("INSERT INTO model_route_health (id,provider,model,failure_count,retry_at,last_success,last_status,updated) VALUES (?,?,?,0,0,?,'ok',?) ON CONFLICT(id) DO UPDATE SET failure_count=0,retry_at=0,last_success=excluded.last_success,last_status='ok',updated=excluded.updated")
      .bind(routeId(route), route.id, route.model, now, now).run();
  } catch { /* An observability write must not discard a valid model reply. */ }
}

export async function recordRouteFailure(route: ModelRoute, error: unknown) {
  const status = error instanceof ModelRequestError ? error.status : 0;
  const row = (await healthRows()).find((item) => item.id === routeId(route));
  const failures = (row?.failure_count || 0) + 1;
  const now = Date.now();
  const retryAt = now + retryDelay(error, failures);
  try {
    await database().prepare("INSERT INTO model_route_health (id,provider,model,failure_count,retry_at,last_success,last_status,updated) VALUES (?,?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET failure_count=excluded.failure_count,retry_at=excluded.retry_at,last_status=excluded.last_status,updated=excluded.updated")
      .bind(routeId(route), route.id, route.model, failures, retryAt,
        status ? `http-${status}` : error instanceof SyntaxError ? "invalid-json" :
          error instanceof Error && error.name === "TimeoutError" ? "timeout" :
          error instanceof Error && error.message === "模型返回的发言不完整" ? "incomplete-output" :
          "invalid-or-network", now).run();
  } catch { /* The next route must still be tried. */ }
}
