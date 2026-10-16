import crypto from "node:crypto";
import readline from "node:readline/promises";
import { productionConfig } from "../production/config.js";
import { ProductionRepository } from "../production/repository.js";
import { hash } from "../production/common.js";
// Interactive terminal only: passwords/tokens are never passed as CLI arguments.
const config = productionConfig(process.cwd()),
  repo = new ProductionRepository(config),
  terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
try {
  const email = (await terminal.question("E-mail do operador: ")).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("E-mail inválido.");
  const data = await repo.request("/auth/v1/admin/users?page=1&per_page=1000");
  let user = data.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Crie a conta no painel Auth do Supabase ou execute em terminal interativo.",
      );
    console.log(
      "Digite uma senha de pelo menos 12 caracteres. A digitação ficará oculta.",
    );
    terminal.close();
    process.stdout.write("Senha: ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const password = await new Promise((resolve) => {
      let value = "";
      const receive = (chunk) => {
        for (const char of chunk.toString()) {
          if (char === "\u0003") {
            process.exitCode = 130;
            finish("");
            return;
          }
          if (char === "\r" || char === "\n") {
            finish(value);
            return;
          }
          if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
          else value += char;
        }
      };
      function finish(result) {
        process.stdin.off("data", receive);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(result);
      }
      process.stdin.on("data", receive);
    });
    if (password.length < 12)
      throw new Error("Senha insuficiente. Nenhuma conta criada.");
    user = await repo.request("/auth/v1/admin/users", {
      method: "POST",
      data: { email, password, email_confirm: true },
    });
  }
  let teams = await repo.table("teams", "?name=eq.UP%20Personnaliza");
  const team =
    teams[0] || (await repo.insert("teams", { name: "UP Personnaliza" }));
  await repo.table("operators", "?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    data: { user_id: user.id, team_id: team.id, role: "admin", enabled: true },
  });
  console.log(
    "Operador autorizado. Acesse /producao/encaixe com a conta configurada.",
  );
  if (process.argv.includes("--mcp")) {
    const token = "up_mcp_" + crypto.randomBytes(32).toString("base64url");
    await repo.insert("tokens", { user_id: user.id, token_hash: hash(token) });
    const fs = await import("node:fs/promises");
    await fs.mkdir(".production", { recursive: true });
    await fs.writeFile(
      ".production/mcp.env",
      `PRODUCTION_URL=${config.origin}\nPRODUCTION_MCP_TOKEN=${token}\n`,
      { mode: 0o600 },
    );
    console.log(
      "Credencial MCP salva em .production/mcp.env (valor omitido), validade 30 dias. Revogue no banco up_production_tokens.",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  terminal.close();
}
