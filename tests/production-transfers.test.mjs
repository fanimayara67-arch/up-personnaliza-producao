import test from "node:test";
import assert from "node:assert/strict";
import {
  signTransfer,
  verifyTransfer,
  verifyStoredFile,
} from "../production/transfers.js";
import { productionConfig } from "../production/config.js";

test("autorizações de transferência expiram e recusam troca de trabalho, tamanho e assinatura", () => {
  const config = { secret: "test-only-".repeat(8) };
  const ticket = { jobId: "job-a", size: 1024, expiresAt: Date.now() + 10000 };
  const signature = signTransfer(config, ticket);
  assert.doesNotThrow(() => verifyTransfer(config, ticket, signature));
  for (const changed of [
    { ...ticket, jobId: "job-b" },
    { ...ticket, size: 10 },
    { ...ticket, expiresAt: Date.now() - 1 },
  ])
    assert.throws(() => verifyTransfer(config, changed, signature), {
      status: 403,
    });
  assert.throws(() => verifyTransfer(config, ticket, "invalid"), {
    status: 403,
  });
});

test("tamanho real do Storage precisa coincidir com a autorização", async () => {
  const repo = {
    config: { maxUpload: 1024 },
    download: async () => new Response("actual-content"),
  };
  await assert.rejects(
    verifyStoredFile(repo, { storage_key: "file", size: 1 }),
    { status: 400 },
  );
});

test("origem publicada usa domínio de produção ou deployment de preview sem aceitar Host do cliente", () => {
  const root = new URL("../.production/empty-config-root/", import.meta.url)
    .pathname;
  const base = {
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "panel.example.com",
    VERCEL_URL: "deployment.vercel.app",
  };
  assert.equal(
    productionConfig(root, base).origin,
    "https://panel.example.com",
  );
  assert.equal(
    productionConfig(root, { ...base, VERCEL_ENV: "preview" }).origin,
    "https://deployment.vercel.app",
  );
  assert.equal(
    productionConfig(root, {
      ...base,
      PRODUCTION_ORIGIN: "https://custom.example.com",
    }).origin,
    "https://custom.example.com",
  );
});
