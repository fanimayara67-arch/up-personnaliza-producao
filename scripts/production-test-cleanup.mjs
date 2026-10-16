// Only removes fixtures with the exact temporary integration-test identity.
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
const repo = new ProductionRepository(productionConfig(process.cwd()));
const teams = (await repo.table("teams", "?select=id,name")).filter((team) =>
  /^Temporary integration test [a-f0-9-]{36}$/.test(team.name),
);
for (const team of teams) {
  const operators = await repo.table("operators", `?team_id=eq.${team.id}`);
  const jobs = await repo.table("jobs", `?team_id=eq.${team.id}&select=id`);
  for (const job of jobs) {
    const artifacts = await repo.table("artifacts", `?job_id=eq.${job.id}`);
    if (artifacts.length)
      await repo.remove(artifacts.map((file) => file.storage_key));
    await repo.table("jobs", `?id=eq.${job.id}`, { method: "DELETE" });
  }
  await repo.table("workers", `?team_id=eq.${team.id}`, { method: "DELETE" });
  await repo.table("operators", `?team_id=eq.${team.id}`, { method: "DELETE" });
  await repo.table("teams", `?id=eq.${team.id}`, { method: "DELETE" });
  for (const operator of operators) {
    const user = await repo.request(`/auth/v1/admin/users/${operator.user_id}`);
    if (/^production-test-[a-f0-9-]{36}@example\.invalid$/.test(user.email))
      await repo.request(`/auth/v1/admin/users/${operator.user_id}`, {
        method: "DELETE",
      });
  }
}
console.log(
  JSON.stringify({
    removedTemporaryTeams: teams.length,
    ownerAccountUntouched: true,
  }),
);
