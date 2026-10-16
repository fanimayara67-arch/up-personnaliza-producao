import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { productionConfig } from "../production/config.js";

const root = process.cwd(),
  config = productionConfig(root);
if (!config.supabaseUrl || !config.supabaseKey)
  throw new Error("Configure o Supabase privado antes de preparar o ambiente.");
const target = path.join(root, ".production", "vercel.env");
let previous = "";
try {
  previous = await fs.readFile(target, "utf8");
} catch {}
const existing = previous.match(
  /^PRODUCTION_SESSION_SECRET="([\w-]{40,})"$/m,
)?.[1];
const values = {
  SUPABASE_URL: config.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: config.supabaseKey,
  PRODUCTION_ENABLED: "true",
  PRODUCTION_ONLY: "true",
  PRODUCTION_ORIGIN: "",
  PRODUCTION_SESSION_SECRET:
    existing || crypto.randomBytes(48).toString("base64url"),
  PRODUCTION_BUCKET: config.bucket,
  AI_GATEWAY_API_KEY: config.gatewayKey,
  PRODUCTION_AI_MODEL: config.model,
  CHECKOUT_ENABLED: "false",
  CATALOG_ADMIN_ENABLED: "false",
  GUEST_SESSION_SECRET: crypto.randomBytes(48).toString("base64url"),
};
for (const value of Object.values(values))
  if (/[\r\n]/.test(value))
    throw new Error("Variável inválida para exportação.");
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(
  target,
  "# PRIVADO: importe somente no projeto Vercel autorizado. Nunca adicione ao Git.\n" +
    Object.entries(values)
      .map(([key, value]) => key + "=" + JSON.stringify(value))
      .join("\n") +
    "\n",
  { mode: 0o600 },
);
console.log(
  "Ambiente privado preparado em .production/vercel.env. Valores não exibidos.",
);
