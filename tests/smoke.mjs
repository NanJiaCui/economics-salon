import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const base = process.env.SALON_TEST_URL || "http://localhost:5173";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, body, cookie) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

let state = (await request("/api/state")).data;
assert.equal(state.session.scope, "global");
assert.equal(state.session.status, "active");
assert.equal(state.messages.length, 0);
assert.equal(state.engine.total, 14);
assert.equal(state.funding.supporters, 0);
assert.equal(state.funding.paymentReady, true);
const radar = await request("/api/models");
assert.equal(radar.status, 200);
assert.equal(radar.data.providers.length, 4);
assert.equal(radar.data.policy.length, 4);
assert.ok(
  radar.data.providers.every(
    (provider) => !Object.hasOwn(provider, "key") && !Object.hasOwn(provider, "value"),
  ),
  "model radar must never expose provider credentials",
);
assert.equal(
  (
    await fetch(base + "/api/cron/salon", {
      method: "POST",
      headers: { Authorization: "Bearer invalid" },
    })
  ).status,
  401,
);
assert.equal(
  (
    await fetch(base + "/api/cron/salon", {
      method: "POST",
      headers: { Authorization: "Bearer test-cron-secret" },
    })
  ).status,
  200,
);

const stripeEvent = JSON.stringify({
  id: "evt_salon_smoke",
  type: "checkout.session.completed",
  data: {
    object: { amount_total: 990, currency: "cny", payment_status: "paid" },
  },
});
const stripeTimestamp = Math.floor(Date.now() / 1000);
const stripeDigest = createHmac("sha256", "whsec_test_salon")
  .update(`${stripeTimestamp}.${stripeEvent}`)
  .digest("hex");
async function stripe(signature) {
  return fetch(base + "/api/fund/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signature,
    },
    body: stripeEvent,
  });
}
assert.equal((await stripe("t=1,v1=invalid")).status, 400);
assert.equal(
  (await stripe(`t=${stripeTimestamp},v1=${stripeDigest}`)).status,
  200,
);
assert.equal(
  (await stripe(`t=${stripeTimestamp},v1=${stripeDigest}`)).status,
  200,
);
state = (await request("/api/state")).data;
assert.equal(state.funding.supporters, 1);
assert.equal(state.funding.totals[0].amount, 990);

assert.equal(
  (
    await request("/api/action", {
      action: "question",
      session: state.session.id,
      body: "融资结构是否会改变技术投资的风险传导？",
      target: "host",
    })
  ).status,
  401,
);

const auth = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "local sign-in cookie");

assert.equal(
  (
    await request(
      "/api/action",
      {
        action: "question",
        session: state.session.id,
        body: "短",
        target: "host",
      },
      cookie,
    )
  ).status,
  400,
);

const question = await request(
  "/api/action",
  {
    action: "question",
    session: state.session.id,
    body: "验收测试：融资结构是否会改变技术投资的风险传导？",
    target: "bernanke",
  },
  cookie,
);
assert.ok(question.data.id);

await Promise.all([
  request(
    "/api/action",
    {
      action: "like",
      session: state.session.id,
      question: question.data.id,
    },
    cookie,
  ),
  request(
    "/api/action",
    {
      action: "like",
      session: state.session.id,
      question: question.data.id,
    },
    cookie,
  ),
]);

const votes = await Promise.all(
  Array.from({ length: 7 }, () =>
    request("/api/action", { action: "vote", topic: "ai-growth" }, cookie),
  ),
);
assert.ok(votes.some((vote) => vote.status === 400));

await wait(2800);
const concurrent = await Promise.all(
  Array.from({ length: 5 }, () => request("/api/autopilot", {})),
);
assert.ok(concurrent.some((result) => result.data.status === "advanced"));

state = (
  await request("/api/state?session=" + state.session.id, undefined, cookie)
).data;
assert.equal(state.messages.length, 1);
assert.equal(state.questions[0].votes, 1);

while (state.session.status !== "complete") {
  await wait(1050);
  await request("/api/autopilot", {});
  state = (
    await request("/api/state?session=" + state.session.id, undefined, cookie)
  ).data;
}

assert.equal(state.session.round, 3);
assert.equal(state.session.turn, 14);
assert.equal(state.messages.length, 14);
assert.equal(state.questions[0].status, "included");
assert.equal(state.engine.currentSpeaker, null);
assert.ok(
  state.messages
    .filter((message) => message.speaker !== "host")
    .every((message) => message.body.startsWith("承接")),
  "every thinker turn should explicitly continue an existing contribution",
);
assert.equal(
  (
    await request(
      "/api/action",
      {
        action: "question",
        session: state.session.id,
        body: "结束后不可再提交问题",
        target: "host",
      },
      cookie,
    )
  ).status,
  400,
);

console.log(
  JSON.stringify({
    passed: true,
    checks: [
      "public global salon",
      "free-model discovery without credential exposure",
      "signed scheduler endpoint",
      "signed idempotent funding webhook",
      "auth guard",
      "question validation",
      "duplicate likes",
      "concurrent daily vote limit",
      "concurrent turn lock",
      "autonomous three-round completion",
      "sequential idea handoff",
      "audience question inclusion",
      "persistent archive",
      "closed-room write guard",
    ],
    messages: state.messages.length,
  }),
);
