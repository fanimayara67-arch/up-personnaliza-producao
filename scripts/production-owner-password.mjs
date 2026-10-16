import fs from "node:fs/promises";
import crypto from "node:crypto";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
const file = ".production/owner-access.json",
  access = JSON.parse(await fs.readFile(file, "utf8")),
  repo = new ProductionRepository(productionConfig(process.cwd()));
const account = await repo.request("/auth/v1/admin/users/" + access.userId);
if (
  account.email !== access.email ||
  access.email !== "producao@uppersonnaliza.local"
)
  throw new Error("A conta não corresponde ao acesso local criado.");
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const password =
  "UP2026" +
  Array.from(
    { length: 18 },
    () => alphabet[crypto.randomInt(alphabet.length)],
  ).join("");
await repo.request("/auth/v1/admin/users/" + access.userId, {
  method: "PUT",
  data: { password },
});
await fs.writeFile(
  file,
  JSON.stringify(
    { ...access, password, changedAt: new Date().toISOString() },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("Senha atualizada na mesma conta. Nenhum outro usuário criado.");
