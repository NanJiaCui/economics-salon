import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/model-routing.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { routeId, rankRoutes, retryDelay, ModelRequestError } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const freeA = { id: 'openrouter', model: 'openrouter/free', free: true, priority: 80 };
const freeB = { id: 'groq', model: 'openai/gpt-oss-120b', free: true, priority: 60 };
const paid = { id: 'minimax', model: 'M2-her', free: false, priority: 100 };
const now = 1_000_000;
assert.deepEqual(rankRoutes([paid, freeA, freeB], [], now).map(x => x.id), ['openrouter', 'groq', 'minimax']);
const health = [{ id: routeId(freeA), last_success: now - 100, retry_at: 0 }, { id: routeId(freeB), last_success: now - 200, retry_at: 0 }];
assert.deepEqual(rankRoutes([freeA, freeB], health, now).map(x => x.id), ['groq', 'openrouter']);
health[1].retry_at = now + 30_000;
assert.deepEqual(rankRoutes([freeA, freeB], health, now).map(x => x.id), ['openrouter']);
assert.equal(retryDelay(new ModelRequestError('limited', 429, 90), 1), 90_000);
assert.equal(retryDelay(new ModelRequestError('unauthorized', 401), 1), 86_400_000);
assert.ok(retryDelay(new Error('network'), 3) > retryDelay(new Error('network'), 1));
console.log('PASS: free-first rotation, cooldown, rate-limit and authorization backoff');
