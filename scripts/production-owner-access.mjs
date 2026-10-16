import fs from "node:fs/promises";
import crypto from "node:crypto";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
const config = productionConfig(process.cwd()),
  repo = new ProductionRepository(config),
  file = ".production/owner-access.json";
const email = "producao@uppersonnaliza.local",
  url = "http://localhost:3101";
const users = await repo.request("/auth/v1/admin/users?page=1&per_page=1000");
let access;
const existing = users.users.find((user) => user.email.toLowerCase() === email);
if (existing) {
  try {
    access = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error("A conta já existe. A senha existente não será alterada.");
  }
} else {
  const password = "UP!" + crypto.randomBytes(18).toString("base64url"),
    user = await repo.request("/auth/v1/admin/users", {
      method: "POST",
      data: { email, password, email_confirm: true },
    });
  access = { email, password, userId: user.id, url: url + "/producao/encaixe" };
}
const teams = await repo.table("teams", "?name=eq.UP%20Personnaliza"),
  team = teams[0] || (await repo.insert("teams", { name: "UP Personnaliza" }));
await repo.table("operators", "?on_conflict=user_id", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  data: {
    user_id: access.userId,
    team_id: team.id,
    role: "admin",
    enabled: true,
  },
});
const login = await fetch(url + "/api/production/login", {
  method: "POST",
  headers: { Origin: url, "Content-Type": "application/json" },
  body: JSON.stringify({ email: access.email, password: access.password }),
});
if (!login.ok)
  throw new Error(
    "Conta autorizada, mas a validação HTTP do login falhou: " + login.status,
  );
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const page = await fetch(access.url, {
  headers: { Cookie: cookie },
  redirect: "manual",
});
if (
  page.status !== 200 ||
  !(await page.text()).includes("Encaixe por contornos")
)
  throw new Error("Login passou, mas o painel não abriu.");
await fs.mkdir(".production", { recursive: true });
await fs.writeFile(
  file,
  JSON.stringify(
    { ...access, teamId: team.id, validatedAt: new Date().toISOString() },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    process.argv.includes("--show")
      ? {
          url: access.url,
          email: access.email,
          password: access.password,
          validated: true,
        }
      : {
          url: access.url,
          email: access.email,
          validated: true,
          credentialsFile: file,
        },
  ),
);
