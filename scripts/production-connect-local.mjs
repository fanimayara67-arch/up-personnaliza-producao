import fs from "node:fs/promises";
const access = JSON.parse(
    await fs.readFile(".production/owner-access.json", "utf8"),
  ),
  url = new URL(access.url).origin;
const login = await fetch(url + "/api/production/login", {
  method: "POST",
  headers: { Origin: url, "Content-Type": "application/json" },
  body: JSON.stringify({ email: access.email, password: access.password }),
});
if (!login.ok) throw new Error("Login do administrador indisponível.");
const cookie = login.headers.get("set-cookie").split(";")[0];
const file = "integrations/corel-worker/config.local.json";
try {
  await fs.access(file);
  console.log("Configuração local existente preservada.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(url + "/api/production/workers", {
    method: "POST",
    headers: {
      Origin: url,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Computador local • Motor SVG UP" }),
  });
  if (!response.ok) throw new Error("Não foi possível autorizar o computador.");
  const worker = await response.json();
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        url,
        credential: worker.credential,
        nestingEngine: "up",
        corel: { progid: "" },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Computador autorizado. Credencial salva apenas na configuração local ignorada.",
  );
}
