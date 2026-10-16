import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function queryProduction(sql, readOnly = true) {
  const c = productionConfig(root);
  if (!c.managementToken)
    throw new Error("Token de gerenciamento Supabase ausente.");
  const ref = new URL(c.supabaseUrl).hostname.split(".")[0];
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql, read_only: readOnly }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Migração: HTTP ${response.status}. Consulte a documentação de diagnóstico Supabase.`,
    );
  return response.json();
}
async function main() {
  let c = productionConfig(root);
  if (process.argv.includes("--apply")) {
    await queryProduction(
      await fs.readFile(path.join(root, "database/production.sql"), "utf8"),
      false,
    );
    const repo = new ProductionRepository(c);
    const buckets = await repo.request("/storage/v1/bucket");
    const bucket = buckets.find((b) => b.id === c.bucket);
    const data = {
      id: c.bucket,
      name: c.bucket,
      public: false,
      file_size_limit: c.maxUpload,
      allowed_mime_types: [
        "image/svg+xml",
        "image/jpeg",
        "application/pdf",
        "application/octet-stream",
        "application/json",
        "application/vnd.corel-draw",
        "application/dxf",
      ],
    };
    await repo.request("/storage/v1/bucket" + (bucket ? "/" + c.bucket : ""), {
      method: bucket ? "PUT" : "POST",
      data,
    });
    if (!c.dedicatedSecret) {
      await fs.appendFile(
        path.join(root, ".env"),
        `\nPRODUCTION_SESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}\n`,
      );
      console.log("Segredo de sessão criado em .env (valor omitido).");
    }
  }
  const result = await queryProduction(
    "select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'up_production_%' order by tablename",
  );
  const bucket = await new ProductionRepository(productionConfig(root)).request(
    "/storage/v1/bucket/" + c.bucket,
  );
  console.log(
    JSON.stringify(
      { tables: result, bucketPrivate: bucket.public === false },
      null,
      2,
    ),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
