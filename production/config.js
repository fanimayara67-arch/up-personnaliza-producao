import fs from "node:fs";
import path from "node:path";
import { loadSettings } from "../lib/settings.js";
export function productionConfig(root, environment = process.env) {
  const file = {};
  try {
    for (const line of fs
      .readFileSync(path.join(root, ".env"), "utf8")
      .split(/\r?\n/)) {
      const m = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
      if (m) file[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
  const env = { ...file, ...environment },
    base = loadSettings(root, environment);
  return {
    ...base,
    enabled: env.PRODUCTION_ENABLED !== "false",
    secret: env.PRODUCTION_SESSION_SECRET || base.sessionSecret,
    dedicatedSecret: Boolean(env.PRODUCTION_SESSION_SECRET),
    origin:
      env.PRODUCTION_ORIGIN ||
      (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
        : env.VERCEL_URL
          ? `https://${env.VERCEL_URL}`
          : `http://localhost:${base.port}`),
    bucket: env.PRODUCTION_BUCKET || "production-up",
    gatewayKey: env.AI_GATEWAY_API_KEY || "",
    model: env.PRODUCTION_AI_MODEL || env.AI_GATEWAY_MODEL || "",
    managementToken: env.SUPABASE_ACCESS_TOKEN || env.supabase_api_key || "",
    maxUpload: 25 * 1024 * 1024,
  };
}
