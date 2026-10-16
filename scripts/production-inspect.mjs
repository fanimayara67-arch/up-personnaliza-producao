import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSettings } from "../lib/settings.js";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  settings = loadSettings(root);
const text = await fs.readFile(path.join(root, ".env"), "utf8").catch(() => ""),
  values = {
    ...Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) =>
          line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/),
        )
        .filter(Boolean)
        .map((match) => [match[1], match[2].replace(/^(['"])(.*)\1$/, "$2")]),
    ),
    ...process.env,
  };
const report = {
  configuredNames: Object.keys(values)
    .filter(
      (name) =>
        /supabase|openai|openrouter|anthropic|gemini|deepseek|groq|gateway|production|corel/i.test(
          name,
        ) && values[name],
    )
    .sort(),
  connections: {},
  aiModels: Object.fromEntries(
    Object.entries(values).filter(([key]) =>
      /^(OPENAI_MODEL|OPENROUTER_MODEL|AI_MODEL|PRODUCTION_AI_MODEL|GEMINI_MODEL)$/.test(
        key,
      ),
    ),
  ),
};
async function probe(name, url, headers) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12000),
    });
    report.connections[name] = { httpStatus: response.status, ok: response.ok };
    return response;
  } catch {
    report.connections[name] = { ok: false, networkUnavailable: true };
  }
}
if (settings.supabaseUrl && settings.supabaseKey) {
  const headers = {
    apikey: settings.supabaseKey,
    Authorization: `Bearer ${settings.supabaseKey}`,
  };
  await probe(
    "supabaseAuth",
    settings.supabaseUrl + "/auth/v1/health",
    headers,
  );
  await probe(
    "supabaseDatabase",
    settings.supabaseUrl + "/rest/v1/cvt_inquiries?select=id&limit=0",
    headers,
  );
  const storage = await probe(
    "supabaseStorage",
    settings.supabaseUrl + "/storage/v1/bucket",
    headers,
  );
  if (storage?.ok)
    report.connections.supabaseStorage.privateBuckets = (
      await storage.json()
    ).filter((row) => !row.public).length;
  const users = await probe(
    "supabaseAuthAdmin",
    settings.supabaseUrl + "/auth/v1/admin/users?page=1&per_page=1",
    headers,
  );
  if (users?.ok) {
    const result = await users.json();
    report.connections.supabaseAuthAdmin.hasExistingUser = Boolean(
      result.users?.length,
    );
  }
}
for (const [name, base, keyName] of [
  [
    "openrouter",
    values.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    "OPENROUTER_API_KEY",
  ],
  [
    "openai",
    values.OPENAI_BASE_URL || "https://api.openai.com/v1",
    "OPENAI_API_KEY",
  ],
])
  if (values[keyName]) {
    const response = await probe(name, base.replace(/\/$/, "") + "/models", {
      Authorization: `Bearer ${values[keyName]}`,
    });
    if (response?.ok) {
      const data = await response.json();
      report.connections[name].modelCount = Array.isArray(data.data)
        ? data.data.length
        : null;
    }
  }
const diagnostic = spawnSync(
  path.join(root, ".venv-production/Scripts/python.exe"),
  [path.join(root, "integrations/corel-worker/worker.py"), "--diagnose"],
  { encoding: "utf8", windowsHide: true, timeout: 20000 },
);
try {
  report.productionComputer = {
    ...JSON.parse(diagnostic.stdout),
    diagnosticExit: diagnostic.status,
  };
} catch {
  report.productionComputer = {
    diagnosticExit: diagnostic.status,
    pythonEnvironmentReady: false,
    corelStatus:
      "not evaluated; install the isolated Python dependencies and repeat",
  };
}
if (values.AI_GATEWAY_API_KEY) {
  const response = await probe(
    "aiGatewayCatalog",
    "https://ai-gateway.vercel.sh/v1/models",
    {},
  );
  if (response?.ok) {
    const data = await response.json();
    report.connections.aiGatewayCatalog.configuredModelFound = data.data?.some(
      (m) => m.id === values.PRODUCTION_AI_MODEL,
    );
    report.connections.aiGatewayCatalog.keyConfigured = true;
    report.connections.aiGatewayCatalog.note =
      "Catalog access does not validate credentials. Use production:ai-check for a real authenticated tool call.";
  }
}
await fs.mkdir(path.join(root, "audit/production-up"), { recursive: true });
await fs.writeFile(
  path.join(root, "audit/production-up/connections.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
