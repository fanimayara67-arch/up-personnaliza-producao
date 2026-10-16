import fs from "node:fs/promises";
import crypto from "node:crypto";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
const repo = new ProductionRepository(productionConfig(process.cwd())),
  file = ".production/browser-fixture.json";
if (process.argv.includes("--cleanup")) {
  const fixture = JSON.parse(await fs.readFile(file, "utf8"));
  const jobs = await repo.table("jobs", "?team_id=eq." + fixture.team);
  for (const job of jobs) {
    const artifacts = await repo.table("artifacts", "?job_id=eq." + job.id);
    if (artifacts.length)
      await repo.remove(artifacts.map((a) => a.storage_key));
    await repo.table("jobs", "?id=eq." + job.id, { method: "DELETE" });
  }
  await repo.table("workers", "?team_id=eq." + fixture.team, {
    method: "DELETE",
  });
  await repo.table("operators", "?team_id=eq." + fixture.team, {
    method: "DELETE",
  });
  await repo.table("teams", "?id=eq." + fixture.team, { method: "DELETE" });
  await repo.request("/auth/v1/admin/users/" + fixture.user, {
    method: "DELETE",
  });
  await fs.unlink(file);
  console.log("Conta e dados temporários do navegador removidos.");
} else {
  await fs.mkdir(".production", { recursive: true });
  try {
    await fs.access(file);
    throw new Error(
      "Fixture já existe. Remova-a pelo comando --cleanup antes de recriar.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const email =
      "browser-production-" + crypto.randomUUID() + "@example.invalid",
    password = crypto.randomBytes(24).toString("base64url");
  const user = await repo.request("/auth/v1/admin/users", {
      method: "POST",
      data: { email, password, email_confirm: true },
    }),
    team = await repo.insert("teams", {
      name: "Temporary browser verification",
    });
  await repo.insert("operators", {
    user_id: user.id,
    team_id: team.id,
    role: "admin",
  });
  await fs.writeFile(
    file,
    JSON.stringify({ user: user.id, team: team.id, email, password }),
    { mode: 0o600 },
  );
  console.log(
    "Conta temporária preparada. Credenciais salvas apenas no arquivo ignorado de teste.",
  );
}
