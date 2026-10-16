import crypto from "node:crypto";
import { normalizeParameters, parameterSchema } from "./parameters.js";
import { requireValue, uuid, hash } from "./common.js";
import {
  originalInfo,
  signTransfer,
  verifyTransfer,
  verifyStoredFile,
} from "./transfers.js";
const operations = {
  analisar_arquivo: "analyze",
  executar_encaixe: "nest",
  validar_resultado: "validate",
  gerar_previa: "preview",
  exportar_arquivo: "export",
};
export const toolDefinitions = [
  {
    name: "analisar_arquivo",
    description: "Analisa o original enviado em uma fila persistente.",
  },
  {
    name: "configurar_chapa",
    description:
      "Define parâmetros em unidades explícitas. Não altera a escala das peças.",
    parameters: parameterSchema,
  },
  {
    name: "executar_encaixe",
    description:
      "Enfileira encaixe real de contornos com os parâmetros já definidos.",
  },
  {
    name: "consultar_progresso",
    description:
      "Consulta estado, eventos, computador, parâmetros e resultados reais.",
  },
  {
    name: "validar_resultado",
    description:
      "Enfileira a conferência geométrica independente do resultado.",
  },
  {
    name: "gerar_previa",
    description: "Enfileira a reconstrução da prévia vetorial.",
  },
  {
    name: "exportar_arquivo",
    description:
      "Enfileira exportação no formato já definido. Exige resultado válido.",
  },
].map((t) => ({
  ...t,
  parameters: t.parameters || {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
}));
export class ProductionService {
  constructor(repo) {
    this.repo = repo;
  }
  async job(operator, id) {
    requireValue(uuid(id), 400, "Identificador inválido.");
    const rows = await this.repo.table(
      "jobs",
      `?id=eq.${id}&team_id=eq.${operator.team_id}`,
    );
    requireValue(rows.length === 1, 404, "Trabalho não encontrado.");
    return rows[0];
  }
  async event(job, action, message, data = {}) {
    return this.repo.insert("events", {
      job_id: job.id,
      action,
      message,
      data,
    });
  }
  async status(operator, id) {
    const job = await this.job(operator, id);
    await this.repo.table(
      "tasks",
      `?job_id=eq.${id}&state=eq.running&lease_until=lt.${encodeURIComponent(new Date().toISOString())}`,
      {
        method: "PATCH",
        data: {
          state: "needs_review",
          message:
            "Conexão interrompida. Confira o documento antes de repetir.",
        },
      },
    );
    const [artifacts, tasks, events, messages, workers] = await Promise.all([
      this.repo.table(
        "artifacts",
        `?job_id=eq.${id}&order=created_at.asc&select=id,kind,name,mime,size,created_at`,
      ),
      this.repo.table(
        "tasks",
        `?job_id=eq.${id}&order=created_at.desc&select=id,operation,state,progress,message,worker_id,lease_until,created_at`,
      ),
      this.repo.table(
        "events",
        `?job_id=eq.${id}&order=created_at.desc&limit=100&select=id,action,message,created_at`,
      ),
      this.repo.table(
        "messages",
        `?job_id=eq.${id}&order=created_at.asc&limit=100&select=role,content,created_at`,
      ),
      this.workers(operator),
    ]);
    return { job, artifacts, tasks, events, messages, workers };
  }
  async workers(operator) {
    return this.repo.table(
      "workers",
      `?team_id=eq.${operator.team_id}&select=id,name,revoked,capabilities,heartbeat_at,live_authorized`,
    );
  }
  async create(operator, name) {
    requireValue(
      typeof name === "string" && name.trim().length > 0 && name.length <= 150,
      400,
      "Informe um nome de até 150 caracteres.",
    );
    return this.repo.insert("jobs", {
      team_id: operator.team_id,
      created_by: operator.user_id,
      name: name.trim(),
    });
  }
  async upload(operator, id, name, data) {
    const job = await this.job(operator, id);
    requireValue(
      job.state === "awaiting_file",
      409,
      "O original deste trabalho já foi recebido. Crie um novo trabalho para outro arquivo.",
    );
    requireValue(
      typeof name === "string" &&
        name.length <= 180 &&
        !/[\\/\x00-\x1f]/.test(name),
      400,
      "Nome de arquivo inválido.",
    );
    const ext = name.split(".").pop().toLowerCase();
    requireValue(
      ["svg", "cdr", "pdf", "dxf", "eps"].includes(ext),
      415,
      "Envie SVG, CDR, PDF, DXF ou EPS.",
    );
    requireValue(data.length > 0, 400, "O arquivo está vazio.");
    const artifactId = crypto.randomUUID(),
      key = `${operator.team_id}/${id}/original/${artifactId}.${ext}`,
      mime =
        ext === "svg"
          ? "image/svg+xml"
          : ext === "pdf"
            ? "application/pdf"
            : "application/octet-stream";
    await this.repo.upload(key, data, mime);
    const artifact = await this.repo.insert("artifacts", {
      id: artifactId,
      job_id: id,
      kind: "original",
      name,
      mime,
      storage_key: key,
      sha256: hash(data),
      size: data.length,
    });
    await this.repo.update("jobs", id, {
      state: "awaiting_analysis",
      updated_at: new Date().toISOString(),
    });
    await this.event(job, "uploaded", "Original recebido e preservado.", {
      name,
      size: data.length,
    });
    return { id: artifact.id, name };
  }
  async execute(operator, id, name, args = {}, key) {
    const job = await this.job(operator, id);
    requireValue(
      toolDefinitions.some((t) => t.name === name),
      404,
      "Ferramenta não disponível.",
    );
    requireValue(
      args && typeof args === "object" && !Array.isArray(args),
      400,
      "Argumentos inválidos.",
    );
    if (name === "consultar_progresso") return this.status(operator, id);
    if (name === "configurar_chapa") {
      requireValue(
        job.analysis,
        409,
        "Analise o arquivo antes de definir as quantidades.",
      );
      const active = await this.repo.table(
        "tasks",
        `?job_id=eq.${id}&state=in.(queued,running,needs_review)&select=id`,
      );
      requireValue(
        !active.length,
        409,
        "Aguarde ou confira a tarefa pendente antes de alterar os parâmetros.",
      );
      const parameters = normalizeParameters(args, job.analysis);
      const updated = await this.repo.rpc("configure", {
        p_job: id,
        p_team: operator.team_id,
        p_revision: job.revision,
        p_parameters: parameters,
      });
      await this.event(
        job,
        "parameters",
        "Parâmetros definidos em milímetros.",
        parameters,
      );
      return { parameters, revision: updated.revision };
    }
    requireValue(
      Object.keys(args).length === 0,
      400,
      "Esta ferramenta não aceita parâmetros adicionais.",
    );
    const original = (
      await this.repo.table("artifacts", `?job_id=eq.${id}&kind=eq.original`)
    )[0];
    requireValue(original, 409, "Envie o arquivo original.");
    const operation = operations[name];
    if (operation !== "analyze") {
      requireValue(job.analysis, 409, "Analise o arquivo primeiro.");
      requireValue(
        job.parameters,
        409,
        "Defina largura, altura, unidade, margens e espaçamento da chapa.",
      );
    }
    if (["validate", "preview", "export"].includes(operation))
      requireValue(
        job.result?.placements,
        409,
        "Execute o encaixe antes desta operação.",
      );
    if (operation === "export")
      requireValue(
        job.validation?.valid,
        409,
        "A exportação exige validação geométrica aprovada.",
      );
    const format = job.parameters?.format || "svg",
      native =
        original.name.toLowerCase().endsWith(".svg") &&
        (["svg", "dxf"].includes(format) || operation === "analyze");
    const capability = (native ? "svg:" : "corel:") + operation;
    requireValue(
      typeof key === "string" && /^[\w-]{8,100}$/.test(key),
      400,
      "Informe uma chave única de operação.",
    );
    return this.repo.rpc("enqueue", {
      p_job: id,
      p_team: operator.team_id,
      p_revision: job.revision,
      p_operation: operation,
      p_capability: capability,
      p_key: key,
    });
  }
  async uploadTicket(operator, id, name, size) {
    const job = await this.job(operator, id);
    requireValue(
      job.state === "awaiting_file",
      409,
      "O original já foi recebido.",
    );
    requireValue(
      Number.isSafeInteger(size) &&
        size > 0 &&
        size <= this.repo.config.maxUpload,
      413,
      "Envie um arquivo de até 25 MB.",
    );
    const { extension, mime } = originalInfo(name),
      artifactId = crypto.randomUUID();
    const ticket = {
      id: artifactId,
      jobId: id,
      teamId: operator.team_id,
      userId: operator.user_id,
      kind: "original",
      name,
      mime,
      size,
      storage_key: `${operator.team_id}/${id}/original/${artifactId}.${extension}`,
      expiresAt: Date.now() + 600000,
    };
    return {
      uploadUrl: await this.repo.signedUpload(ticket.storage_key),
      ticket,
      signature: signTransfer(this.repo.config, ticket),
    };
  }
  async completeUpload(operator, id, { ticket, signature }) {
    await this.job(operator, id);
    verifyTransfer(this.repo.config, ticket, signature);
    requireValue(
      ticket.jobId === id &&
        ticket.teamId === operator.team_id &&
        ticket.userId === operator.user_id &&
        ticket.kind === "original",
      403,
      "Arquivo não pertence ao operador ou trabalho.",
    );
    const existing = (
      await this.repo.table("artifacts", `?id=eq.${ticket.id}&job_id=eq.${id}`)
    )[0];
    if (existing) return { id: existing.id, name: existing.name };
    const job = await this.job(operator, id);
    requireValue(
      job.state === "awaiting_file",
      409,
      "O original já foi recebido.",
    );
    const verified = await verifyStoredFile(this.repo, ticket);
    await this.repo.insert("artifacts", {
      id: ticket.id,
      job_id: id,
      kind: "original",
      name: ticket.name,
      mime: ticket.mime,
      storage_key: ticket.storage_key,
      size: ticket.size,
      sha256: verified.sha256,
    });
    await this.repo.update("jobs", id, {
      state: "awaiting_analysis",
      updated_at: new Date().toISOString(),
    });
    await this.event(
      job,
      "uploaded",
      "Original recebido e preservado por envio direto privado.",
      { name: ticket.name, size: ticket.size },
    );
    return { id: ticket.id, name: ticket.name };
  }
  async review(operator, id, taskId) {
    await this.job(operator, id);
    requireValue(uuid(taskId), 400, "Tarefa inválida.");
    const rows = await this.repo.table(
      "tasks",
      `?id=eq.${taskId}&job_id=eq.${id}&state=eq.needs_review`,
      {
        method: "PATCH",
        data: {
          state: "failed",
          message:
            "Operador conferiu a execução interrompida. Uma nova execução requer comando explícito.",
          finished_at: new Date().toISOString(),
        },
        headers: { Prefer: "return=representation" },
      },
    );
    requireValue(
      rows.length === 1,
      409,
      "Esta tarefa não está aguardando conferência.",
    );
    return rows[0];
  }
  async enroll(operator, name) {
    requireValue(
      operator.role === "admin",
      403,
      "Somente administradores podem autorizar computadores.",
    );
    requireValue(
      typeof name === "string" && name.trim() && name.length <= 100,
      400,
      "Nome do computador inválido.",
    );
    const credential =
      "up_worker_" + crypto.randomBytes(32).toString("base64url");
    const worker = await this.repo.insert("workers", {
      team_id: operator.team_id,
      name: name.trim(),
      token_hash: hash(credential),
    });
    return { id: worker.id, credential };
  }
}
