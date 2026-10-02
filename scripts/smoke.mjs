const raw = process.argv[2] || process.env.MAURILIO_SMOKE_URL;

if (!raw) {
  console.error("Usage: node scripts/smoke.mjs https://deployment.example.com");
  process.exit(2);
}

const input = new URL(raw);
const base =
  input.pathname === "/" || input.pathname === ""
    ? new URL("/maurilio", input.origin)
    : new URL(input.pathname.replace(/\/$/, ""), input.origin);

function url(path = "") {
  return new URL(`${base.pathname}${path}`, base.origin);
}

async function request(path, init = {}) {
  const target = url(path);
  const response = await fetch(target, {
    redirect: "manual",
    ...init,
  });
  return { target, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function textCheck(path) {
  const { target, response } = await request(path);
  assert(response.status === 200, `${target} returned ${response.status}`);
  const type = response.headers.get("content-type") || "";
  assert(type.includes("text/html"), `${target} is not HTML`);
  return response.text();
}

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`✗ ${name}: ${results.at(-1).error}`);
  }
}

await check("health is ready", async () => {
  const { response } = await request("/api/health");
  assert(response.status === 200, `health returned ${response.status}`);
  const body = await response.json();
  assert(body.status === "ok", `health status is ${body.status}`);
  assert(body.database?.configured === true, "database is not configured");
  assert(body.database?.reachable === true, "database is not reachable");
});

await check("home never presents demo as production", async () => {
  const body = await textCheck("");
  assert(!body.includes("DATOS DEMO"), "production rendered demo data");
  assert(!body.includes("CUOTA BET365 NO VERIFICADA"), "production rendered unverified demo odds");
});

await check("public ledger renders", async () => {
  await textCheck("/archive");
});

await check("public integrity proof renders without premium disclosure", async () => {
  const body = await textCheck("/integrity");
  assert(body.includes("PROOF OF PROCESS"), "integrity proof heading is missing");
  assert(!body.includes("principal_risk"), "integrity page leaked internal premium fields");
  assert(!body.includes("thesis"), "integrity page leaked internal thesis fields");
});

await check("buyer library renders safely without entitlement", async () => {
  const { response } = await request("/access");
  assert(response.status === 200, `buyer library returned ${response.status}`);
  assert(
    (response.headers.get("cache-control") || "").includes("no-store"),
    "buyer library is cacheable",
  );
  assert(
    response.headers.get("referrer-policy") === "no-referrer",
    "buyer library can leak referrers",
  );
  const body = await response.text();
  assert(body.includes("Mis informes"), "buyer library heading is missing");
  assert(body.includes("ACCESS RECOVERY"), "recovery experience is missing");
  assert(!body.includes("ACCESS VERIFIED</b>"), "anonymous buyer library exposed a verified report");
});

await check("recovery issue fails closed without browser origin", async () => {
  const { response } = await request("/api/access/recovery/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert(response.status === 403, `origin-less recovery issue returned ${response.status}`);
});

await check("recovery redeem fails closed without browser origin", async () => {
  const { response } = await request("/api/access/recovery/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "MB-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA",
    }),
  });
  assert(response.status === 403, `origin-less recovery redeem returned ${response.status}`);
});

await check("historical premium report rejects anonymous access", async () => {
  const { response } = await request(
    "/access/report?matchday=2099-01-01&tier=pro",
  );
  assert(response.status === 404, `anonymous historical report returned ${response.status}`);
});

await check("checkout config is server driven", async () => {
  const { response } = await request("/api/checkout");
  assert(response.status === 200, `checkout config returned ${response.status}`);
  const body = await response.json();
  assert(body.provider === "mercado_pago", "unexpected payment provider");
  assert(typeof body.enabled === "boolean", "checkout enabled flag is missing");
  assert(body.prices && typeof body.prices === "object", "server prices are missing");
  assert(body.availability && typeof body.availability === "object", "tier availability is missing");
});

await check("anonymous access has no premium entitlement", async () => {
  const { response } = await request("/api/access");
  assert(response.status === 200, `access returned ${response.status}`);
  const body = await response.json();
  assert(body.pro === false && body.elite === false, "anonymous request has premium entitlement");
});

await check("premium report is protected", async () => {
  const { response } = await request("/api/premium/pro");
  assert(
    response.status === 403 || response.status === 404,
    `anonymous premium request returned ${response.status}`,
  );
});

await check("checkout POST fails closed without browser origin", async () => {
  const { response } = await request("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "pro" }),
  });
  assert(response.status === 403, `origin-less checkout returned ${response.status}`);
});

await check("admin audit API rejects anonymous access", async () => {
  const { response } = await request("/api/admin/audit");
  assert(response.status === 401, `anonymous admin audit returned ${response.status}`);
});

await check("admin login fails closed without browser origin", async () => {
  const { response } = await request("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "not-a-real-secret" }),
  });
  assert(response.status === 403, `origin-less admin login returned ${response.status}`);
});

await check("Control Room does not error publicly", async () => {
  const { response } = await request("/control-room");
  assert(
    response.status === 200 || response.status === 404,
    `Control Room returned unexpected ${response.status}`,
  );
});

console.log("");
console.log(`Smoke target: ${base.href}`);
console.log(`Passed: ${results.filter((item) => item.ok).length}/${results.length}`);

const failures = results.filter((item) => !item.ok);
if (failures.length > 0) {
  process.exit(1);
}
