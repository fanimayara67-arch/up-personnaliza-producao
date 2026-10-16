import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { productionConfig } from "../production/config.js";
import { createProduction } from "../production/router.js";
const root = process.cwd(),
  config = productionConfig(root),
  production = createProduction({ root, config }),
  repo = production.repo;
const server = http.createServer((req, res) =>
  production.handle(req, res, new URL(req.url, "http://localhost")),
);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
config.origin = base;
const record = {
  checks: [],
  geometry: "real Python/Shapely, Supabase Auth/PostgreSQL/Storage real",
  corel: "not installed; not tested",
  ecut: "not installed; not tested",
};
let user, team, job, worker, worker2;
const storageKeys = [];
async function call(
  route,
  { data, bytes, token, cookie, key, method = "POST", lease } = {},
) {
  const response = await fetch(base + "/api/production" + route, {
    method,
    headers: {
      Origin: base,
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(lease ? { "X-Production-Lease": lease } : {}),
    },
    body: bytes || (data && JSON.stringify(data)),
  });
  let result;
  try {
    result = await response.json();
  } catch {}
  return { response, data: result };
}
function check(name, condition) {
  assert.ok(condition, name);
  record.checks.push(name);
  console.log("OK " + name);
}
async function runWorker(credential) {
  const folder = path.join(
    root,
    ".production",
    "integration-worker-" + crypto.randomUUID(),
  );
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, "config.json");
  await fs.writeFile(
    file,
    JSON.stringify({ url: base, credential, corel: { progid: "" } }),
  );
  const executable = path.join(
    root,
    ".venv-production",
    "Scripts",
    "python.exe",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        path.join(root, "integrations/corel-worker/worker.py"),
        "--config",
        file,
        "--state",
        path.join(folder, "state"),
        "--allow-loopback",
        "--once",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Worker excedeu o limite do teste."));
    }, 60000);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code) reject(new Error("Worker falhou: " + output));
      else resolve(output);
    });
  });
}
try {
  const unauth = await call("/jobs", { method: "GET" });
  check("API recusa acesso sem sessão", unauth.response.status === 401);
  const password = crypto.randomBytes(24).toString("base64url");
  user = await repo.request("/auth/v1/admin/users", {
    method: "POST",
    data: {
      email: "production-test-" + crypto.randomUUID() + "@example.invalid",
      password,
      email_confirm: true,
    },
  });
  team = await repo.insert("teams", {
    name: "Temporary integration test " + crypto.randomUUID(),
  });
  await repo.insert("operators", {
    user_id: user.id,
    team_id: team.id,
    role: "admin",
  });
  const login = await call("/login", { data: { email: user.email, password } });
  check(
    "Autenticação Supabase real e cookie HttpOnly",
    login.response.ok &&
      login.response.headers.get("set-cookie").includes("HttpOnly"),
  );
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  job = (
    await call("/jobs", {
      cookie,
      data: { name: "Real contour integration test" },
    })
  ).data;
  check("Criação privada de trabalho", Boolean(job.id));
  check(
    "Upload inválido é rejeitado",
    (
      await call("/jobs/" + job.id + "/upload?name=malicious.exe", {
        cookie,
        bytes: Buffer.from("x"),
      })
    ).response.status === 415,
  );
  const original = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><!--' +
      "x".repeat(5 * 1024 * 1024) +
      '--><path d="M0 0H30V10H10V30H0Z"/></svg>',
  );
  const authorization = await call("/jobs/" + job.id + "/upload-ticket", {
    cookie,
    data: { name: "pieces.svg", size: original.length },
  });
  check(
    "Upload assinado exige sessão",
    (
      await call("/jobs/" + job.id + "/upload-ticket", {
        data: { name: "pieces.svg", size: 1 },
      })
    ).response.status === 401,
  );
  check(
    "Limite de 25 MB conferido antes de autorizar",
    (
      await call("/jobs/" + job.id + "/upload-ticket", {
        cookie,
        data: { name: "pieces.svg", size: 26 * 1024 * 1024 },
      })
    ).response.status === 413,
  );
  check(
    "Autorização temporária sem credencial administrativa",
    authorization.response.ok &&
      authorization.data.uploadUrl.startsWith(
        config.supabaseUrl + "/storage/v1/",
      ) &&
      !JSON.stringify(authorization.data).includes(config.supabaseKey),
  );
  const uploaded = await fetch(authorization.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/svg+xml", "x-upsert": "false" },
    body: original,
  });
  storageKeys.push(authorization.data.ticket.storage_key);
  check(
    "Arquivo acima de 4,5 MB enviado diretamente ao Storage",
    uploaded.ok && original.length > 4.5 * 1024 * 1024,
  );
  check(
    "Autorização adulterada é recusada",
    (
      await call("/jobs/" + job.id + "/upload-complete", {
        cookie,
        data: {
          ...authorization.data,
          ticket: { ...authorization.data.ticket, size: 1 },
        },
      })
    ).response.status === 403,
  );
  const completed = await call("/jobs/" + job.id + "/upload-complete", {
    cookie,
    data: {
      ticket: authorization.data.ticket,
      signature: authorization.data.signature,
    },
  });
  check(
    "Original preservado com tamanho e SHA-256 conferidos",
    completed.response.status === 201 &&
      (await repo.table("artifacts", "?id=eq." + completed.data.id))[0]
        .sha256 === crypto.createHash("sha256").update(original).digest("hex"),
  );
  check(
    "Confirmação perdida pode ser repetida sem duplicar original",
    (
      await call("/jobs/" + job.id + "/upload-complete", {
        cookie,
        data: {
          ticket: authorization.data.ticket,
          signature: authorization.data.signature,
        },
      })
    ).data.id === completed.data.id,
  );
  const key = crypto.randomUUID(),
    first = await call("/jobs/" + job.id + "/tools/analisar_arquivo", {
      cookie,
      data: {},
      key,
    }),
    duplicate = await call("/jobs/" + job.id + "/tools/analisar_arquivo", {
      cookie,
      data: {},
      key,
    });
  check(
    "Enfileiramento idempotente",
    first.data.id === duplicate.data.id && first.data.state === "queued",
  );
  let status = (await call("/jobs/" + job.id, { cookie, method: "GET" })).data;
  check(
    "Computador ausente não produz progresso fictício",
    status.job.state === "awaiting_worker" && status.tasks[0].progress === 0,
  );
  worker = (
    await call("/workers", {
      cookie,
      data: { name: "Integration geometry worker" },
    })
  ).data;
  worker2 = (
    await call("/workers", {
      cookie,
      data: { name: "Integration concurrent claimant" },
    })
  ).data;
  const greetings = await Promise.all(
    [worker, worker2].map((w) =>
      call("/worker/hello", {
        token: w.credential,
        data: { instance: w.id, capabilities: { operations: ["svg:analyze"] } },
      }),
    ),
  );
  check(
    "Conector negocia transporte assinado",
    greetings.every((g) => g.data.signedTransfer === true),
  );
  const claims = await Promise.all(
    [worker, worker2].map((w) =>
      call("/worker/claim", { token: w.credential, data: { instance: w.id } }),
    ),
  );
  check(
    "Fila concede aquisição exclusiva a um computador",
    claims.filter((c) => c.data.task).length === 1,
  );
  const claimed = claims.find((c) => c.data.task).data.task,
    owner = claims[0].data.task ? worker : worker2;
  await repo.update("tasks", claimed.id, {
    lease_until: new Date(Date.now() - 1000).toISOString(),
  });
  check(
    "Concessão vencida recusa conclusão ambígua",
    (
      await call("/worker/finish?task=" + claimed.id, {
        token: owner.credential,
        lease: claimed.lease_token,
        data: { ok: true, result: {}, artifacts: [], message: "stale" },
      })
    ).response.status === 409,
  );
  status = (await call("/jobs/" + job.id, { cookie, method: "GET" })).data;
  check(
    "Interrupção exige conferência antes de repetir",
    status.tasks[0].state === "needs_review",
  );
  await call("/jobs/" + job.id + "/review", {
    cookie,
    data: { task: claimed.id },
  });
  await call("/jobs/" + job.id + "/tools/analisar_arquivo", {
    cookie,
    data: {},
    key: crypto.randomUUID(),
  });
  await runWorker(worker.credential);
  status = (await call("/jobs/" + job.id, { cookie, method: "GET" })).data;
  check(
    "Análise SVG real pelo conector",
    status.job.state === "awaiting_parameters" &&
      status.job.analysis.pieces.length === 1,
  );
  check(
    "Parâmetros indispensáveis são validados",
    (
      await call("/jobs/" + job.id + "/tools/configurar_chapa", {
        cookie,
        data: { width: 43 },
      })
    ).response.status === 400,
  );
  const configured = await call("/jobs/" + job.id + "/tools/configurar_chapa", {
    cookie,
    data: {
      width: 4.3,
      height: 4.3,
      unit: "cm",
      margin: 0,
      gap: 0,
      quantities: { p1: 2 },
      timeLimit: 5,
    },
  });
  check(
    "Dimensões e quantidades normalizadas",
    configured.data.parameters.width === 43 &&
      configured.data.parameters.quantities.p1 === 2,
  );
  await call("/jobs/" + job.id + "/tools/executar_encaixe", {
    cookie,
    data: {},
    key: crypto.randomUUID(),
  });
  await runWorker(worker.credential);
  status = (await call("/jobs/" + job.id, { cookie, method: "GET" })).data;
  check(
    "Nesting real com validação e prévia privada",
    status.job.state === "completed" &&
      status.job.validation.valid &&
      status.job.validation.pieces === 2 &&
      status.artifacts.some((a) => a.kind === "result"),
  );
  const result = status.artifacts.findLast((a) => a.kind === "result");
  check(
    "Arquivo protegido contra acesso anônimo",
    (await fetch(base + "/api/production/files/" + result.id)).status === 401,
  );
  const redirect = await fetch(base + "/api/production/files/" + result.id, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  check(
    "Download autorizado retorna URL temporária privada",
    redirect.status === 302 &&
      redirect.headers
        .get("location")
        .startsWith(config.supabaseUrl + "/storage/v1/object/sign/"),
  );
  const downloaded = await fetch(redirect.headers.get("location"));
  check(
    "Exportação SVG editável com escala real",
    (await downloaded.text()).includes("43.000000000mm"),
  );
  const assistant = await call("/jobs/" + job.id + "/chat", {
    cookie,
    data: {
      message:
        "Consulte o progresso real deste trabalho usando consultar_progresso e explique o resultado, sem alterar parâmetros.",
    },
  });
  check(
    "Assistente UP usa ferramenta real pelo gateway",
    assistant.response.ok &&
      assistant.data.tools?.some(
        (t) => t.name === "consultar_progresso" && t.success,
      ),
  );
  const token = await repo.insert("tokens", {
    user_id: user.id,
    token_hash: (await import("../production/common.js")).hash(
      "up_mcp_" + crypto.randomUUID(),
    ),
  });
  check("Credenciais de ferramentas ficam no backend", Boolean(token.id));
  await repo.update("workers", worker.id, { revoked: true });
  check(
    "Revogação do computador é imediata",
    (
      await call("/worker/claim", {
        token: worker.credential,
        data: { instance: worker.id },
      })
    ).response.status === 401,
  );
} finally {
  if (job?.id) {
    const artifacts = await repo.table("artifacts", "?job_id=eq." + job.id);
    storageKeys.push(...artifacts.map((a) => a.storage_key));
    if (storageKeys.length) await repo.remove(storageKeys);
    await repo.table("jobs", "?id=eq." + job.id, { method: "DELETE" });
  }
  if (team?.id) {
    await repo.table("workers", "?team_id=eq." + team.id, { method: "DELETE" });
    await repo.table("operators", "?team_id=eq." + team.id, {
      method: "DELETE",
    });
    await repo.table("teams", "?id=eq." + team.id, { method: "DELETE" });
  }
  if (user?.id)
    await repo.request("/auth/v1/admin/users/" + user.id, { method: "DELETE" });
  await new Promise((resolve) => server.close(resolve));
  await fs.mkdir("audit/production-up", { recursive: true });
  await fs.writeFile(
    "audit/production-up/integration.json",
    JSON.stringify(record, null, 2),
  );
}
console.log(
  JSON.stringify({
    passed: record.checks.length,
    corel: record.corel,
    ecut: record.ecut,
  }),
);
