import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefinitions } from "../../production/service.js";
const base = process.env.PRODUCTION_URL,
  token = process.env.PRODUCTION_MCP_TOKEN;
if (!base || !token?.startsWith("up_mcp_"))
  throw new Error(
    "Configure PRODUCTION_URL e PRODUCTION_MCP_TOKEN. Nunca use a chave administrativa do Supabase.",
  );
const url = new URL(base);
if (
  url.protocol !== "https:" &&
  !(
    process.env.PRODUCTION_MCP_ALLOW_LOOPBACK === "true" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
)
  throw new Error(
    "O MCP exige HTTPS; loopback local precisa de autorização explícita na configuração.",
  );
const server = new Server(
  { name: "up-personnaliza-production", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Ferramentas privadas de produção. jobId identifica um trabalho previamente criado no painel; não há acesso a SQL, shell ou máquina de corte.",
  },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: {
      ...t.parameters,
      properties: {
        jobId: { type: "string", format: "uuid" },
        ...t.parameters.properties,
      },
      required: ["jobId", ...(t.parameters.required || [])],
    },
    annotations: {
      readOnlyHint: t.name === "consultar_progresso",
      destructiveHint: false,
      idempotentHint: t.name === "consultar_progresso",
      openWorldHint: false,
    },
  })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const tool = toolDefinitions.find((t) => t.name === request.params.name);
    if (!tool) throw new Error("Ferramenta não disponível.");
    const { jobId, ...parameters } = request.params.arguments || {};
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId))
      throw new Error("Informe jobId válido.");
    const response = await fetch(
      new URL(`/api/production/jobs/${jobId}/tools/${tool.name}`, url),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(parameters),
        signal: AbortSignal.timeout(25000),
      },
    );
    const result = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
      isError: !response.ok,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text:
            error.message === "Ferramenta não disponível." ||
            error.message === "Informe jobId válido."
              ? error.message
              : "Não foi possível consultar a API de produção.",
        },
      ],
      isError: true,
    };
  }
});
await server.connect(new StdioServerTransport());
