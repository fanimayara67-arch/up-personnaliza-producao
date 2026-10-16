import fs from "node:fs/promises";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "../integrations/production-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../integrations/production-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
import { hash } from "../production/common.js";
const fixture = JSON.parse(
    await fs.readFile(".production/browser-fixture.json", "utf8"),
  ),
  repo = new ProductionRepository(productionConfig(process.cwd())),
  token = "up_mcp_" + crypto.randomBytes(32).toString("base64url");
const record = await repo.insert("tokens", {
  user_id: fixture.user,
  token_hash: hash(token),
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["integrations/production-mcp/index.mjs"],
  cwd: process.cwd(),
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PRODUCTION_URL: "http://localhost:3101",
    PRODUCTION_MCP_ALLOW_LOOPBACK: "true",
    PRODUCTION_MCP_TOKEN: token,
  },
  stderr: "pipe",
});
const client = new Client({ name: "up-production-verifier", version: "1.0.0" });
try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 7);
  const jobs = await repo.table("jobs", "?team_id=eq." + fixture.team),
    job = jobs[0];
  assert.ok(job);
  const progress = await client.callTool({
    name: "consultar_progresso",
    arguments: { jobId: job.id },
  });
  assert.equal(progress.isError, false);
  assert.equal(progress.structuredContent.job.id, job.id);
  await repo.update("tokens", record.id, { revoked: true });
  const denied = await client.callTool({
    name: "consultar_progresso",
    arguments: { jobId: job.id },
  });
  assert.equal(denied.isError, true);
  console.log(
    JSON.stringify({
      protocol: "official MCP SDK / stdio",
      tools: listed.tools.map((t) => t.name),
      authenticatedAPI: true,
      revocation: true,
    }),
  );
} finally {
  await client.close();
  await repo.table("tokens", "?id=eq." + record.id, { method: "DELETE" });
}
