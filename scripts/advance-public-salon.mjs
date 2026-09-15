const site = (process.env.SALON_URL || "").replace(/\/$/, "");

if (!site) throw new Error("SALON_URL is required");

const endpoint = `${site}/api/autopilot`;
const deadline = Date.now() + 5.5 * 60 * 1000;

while (Date.now() < deadline) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "User-Agent": "economics-salon-github-scheduler" },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Salon returned ${response.status}: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify(result));

  if (result.status === "complete") break;

  const nextAt = Number(result.nextAt || 0);
  const waitMs = nextAt ? nextAt - Date.now() : 12000;

  // A long wait means this stage is complete and the next scheduled round
  // belongs to a later GitHub Actions run.
  if (waitMs > 120000) break;

  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(3000, Math.min(50000, waitMs + 750))),
  );
}
