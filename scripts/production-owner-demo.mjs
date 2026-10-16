import fs from "node:fs/promises";
import crypto from "node:crypto";
const access = JSON.parse(
    await fs.readFile(".production/owner-access.json", "utf8"),
  ),
  base = new URL(access.url).origin;
const login = await fetch(base + "/api/production/login", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ email: access.email, password: access.password }),
});
if (!login.ok) throw new Error("Login indisponível.");
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(route, data, bytes) {
  const r = await fetch(base + "/api/production" + route, {
    method: data || bytes ? "POST" : "GET",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": bytes ? "application/octet-stream" : "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: bytes || (data && JSON.stringify(data)),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error);
  return json;
}
const jobs = (await api("/jobs")).jobs;
let job = jobs.find((j) => j.name === "Exemplo técnico • encaixe de contornos");
if (!job) {
  job = await api("/jobs", { name: "Exemplo técnico • encaixe de contornos" });
  await api(
    "/jobs/" + job.id + "/upload?name=pecas-vetoriais.svg",
    null,
    await fs.readFile("examples/production/pecas.svg"),
  );
  await api("/jobs/" + job.id + "/tools/analisar_arquivo", {});
}
async function waitFor(state) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const data = await api("/jobs/" + job.id);
    if (data.job.state === state) return data;
    if (data.job.state === "failed" || data.tasks[0]?.state === "needs_review")
      throw new Error("Trabalho requer conferência: " + data.tasks[0]?.message);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("O computador ainda não concluiu esta etapa.");
}
let data = await api("/jobs/" + job.id);
if (data.job.state !== "completed") {
  await waitFor("awaiting_parameters");
  await api("/jobs/" + job.id + "/tools/configurar_chapa", {
    width: 120,
    height: 90,
    unit: "mm",
    margin: 5,
    gap: 3,
    quantities: { p1: 2, p2: 1, p3: 1 },
    timeLimit: 10,
    format: "svg",
    material: "Exemplo técnico de conferência",
  });
  await api("/jobs/" + job.id + "/tools/executar_encaixe", {});
  data = await waitFor("completed");
}
await fs.writeFile(
  "audit/production-up/owner-demo.json",
  JSON.stringify(
    {
      jobId: job.id,
      valid: data.job.validation.valid,
      pieces: data.job.validation.pieces,
      artifacts: data.artifacts.map((a) => ({ kind: a.kind, name: a.name })),
      source: "Arquivo técnico de exemplo; processamento geométrico real.",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    url: base + "/producao/encaixe?job=" + job.id,
    valid: data.job.validation.valid,
    pieces: data.job.validation.pieces,
    preview: data.artifacts.some((a) => a.kind === "preview"),
    downloads: data.artifacts.filter((a) =>
      ["result", "validation"].includes(a.kind),
    ).length,
  }),
);
