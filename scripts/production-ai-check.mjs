import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productionConfig } from "../production/config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  c = productionConfig(root);
const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw new Error("Catálogo de modelos indisponível.");
const { data } = await response.json();
const compatible = data.filter(
  (m) =>
    m.type === "language" &&
    m.tags?.includes("tool-use") &&
    m.supported_parameters?.includes("tools"),
);
const interactive = compatible.filter(
  (m) => !/batch|audio|search|realtime/.test(m.id),
);
const preferred =
  interactive.find((m) => m.id === c.model) ||
  interactive.find((m) => m.id === "openai/gpt-4.1-mini") ||
  interactive[0];
if (!preferred) throw new Error("Nenhum modelo compatível encontrado.");
console.log(
  JSON.stringify({
    catalogModels: data.length,
    compatible: compatible.length,
    selected: preferred.id,
    pricing: preferred.pricing,
  }),
);
if (c.model !== preferred.id && process.argv.includes("--configure")) {
  const original = await fs.readFile(path.join(root, ".env"), "utf8");
  await fs.writeFile(
    path.join(root, ".env"),
    original.replace(/^PRODUCTION_AI_MODEL=.*\r?\n?/gm, "") +
      `\nPRODUCTION_AI_MODEL=${preferred.id}\n`,
  );
}
if (process.argv.includes("--live")) {
  if (!c.gatewayKey) throw new Error("AI_GATEWAY_API_KEY ausente.");
  const result = await fetch(
    "https://ai-gateway.vercel.sh/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.gatewayKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: preferred.id,
        messages: [
          {
            role: "user",
            content:
              "Confirme os parâmetros de uma chapa de 120 por 90 centímetros e espaçamento de 5 milímetros usando a ferramenta.",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "conferir",
              description: "Confere dimensões em milímetros.",
              parameters: {
                type: "object",
                properties: {
                  width: { type: "number" },
                  height: { type: "number" },
                  gap: { type: "number" },
                },
                required: ["width", "height", "gap"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "conferir" } },
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  let json = {};
  try {
    json = await result.json();
  } catch {}
  console.log(
    JSON.stringify({
      httpStatus: result.status,
      model: json.model,
      tool: json.choices?.[0]?.message?.tool_calls?.[0]?.function,
      usage: json.usage,
      errorType: json.error?.type || json.error?.code,
    }),
  );
}
