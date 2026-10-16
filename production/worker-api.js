import crypto from "node:crypto";
import { requireValue, uuid, hash, body, readJSON, send } from "./common.js";
import { signTransfer, verifyTransfer, verifyStoredFile } from "./transfers.js";
export class WorkerAPI {
  constructor(repo, auth) {
    this.repo = repo;
    this.auth = auth;
  }
  async task(worker, id, lease, allowFinished = false) {
    requireValue(uuid(id) && uuid(lease), 400, "Tarefa ou concessão inválida.");
    const rows = await this.repo.table(
      "tasks",
      `?id=eq.${id}&worker_id=eq.${worker.id}&lease_token=eq.${lease}`,
    );
    const task = rows[0];
    requireValue(
      task &&
        ((allowFinished && ["completed", "failed"].includes(task.state)) ||
          (task.state === "running" &&
            new Date(task.lease_until) > new Date())),
      409,
      "Tarefa sem concessão válida. Confira antes de repetir.",
    );
    return task;
  }
  receipt(item) {
    return crypto
      .createHmac("sha256", this.auth.config.secret)
      .update(JSON.stringify(item))
      .digest("hex");
  }
  async handle(req, res, url) {
    const worker = await this.auth.worker(req),
      route = url.pathname.slice("/api/production/worker".length);
    requireValue(
      req.method === "POST" || (route === "/file" && req.method === "GET"),
      405,
      "Método não permitido.",
    );
    if (route === "/hello") {
      const data = await readJSON(req);
      requireValue(
        typeof data.instance === "string" && data.instance.length <= 100,
        400,
        "Instância inválida.",
      );
      requireValue(
        Array.isArray(data.capabilities?.operations) &&
          data.capabilities.operations.length <= 20 &&
          data.capabilities.operations.every((v) =>
            /^(svg|corel):(analyze|nest|validate|preview|export)$/.test(v),
          ),
        400,
        "Capacidades inválidas.",
      );
      await this.repo.update("workers", worker.id, {
        heartbeat_at: new Date().toISOString(),
        instance_id: data.instance,
        capabilities: data.capabilities,
        live_authorized: data.liveAuthorized === true,
      });
      return send(res, 200, {
        connected: true,
        workerId: worker.id,
        signedTransfer: true,
        serverTime: new Date().toISOString(),
      });
    }
    if (route === "/claim") {
      const data = await readJSON(req);
      requireValue(
        typeof data.instance === "string" &&
          data.instance === worker.instance_id,
        409,
        "Registre esta instância antes de buscar tarefas.",
      );
      return send(res, 200, {
        task: await this.repo.rpc("claim", {
          p_worker: worker.id,
          p_instance: data.instance,
        }),
      });
    }
    const id = url.searchParams.get("task"),
      lease = req.headers["x-production-lease"];
    const task = await this.task(worker, id, lease, route === "/finish");
    if (route === "/file") {
      const artifactId = url.searchParams.get("artifact");
      requireValue(uuid(artifactId), 400, "Arquivo inválido.");
      const artifacts = await this.repo.table(
        "artifacts",
        `?id=eq.${artifactId}&job_id=eq.${task.job_id}`,
      );
      requireValue(artifacts.length === 1, 404, "Arquivo não encontrado.");
      if (req.headers["x-production-transfer"] === "signed-v1") {
        return send(res, 200, {
          downloadUrl: await this.repo.signedDownload(artifacts[0].storage_key),
        });
      }
      const file = await this.repo.download(artifacts[0].storage_key);
      res.writeHead(200, {
        "Content-Type": artifacts[0].mime,
        "Cache-Control": "no-store",
      });
      res.end(Buffer.from(await file.arrayBuffer()));
      return;
    }
    if (route === "/manifest") {
      const artifacts = await this.repo.table(
        "artifacts",
        `?job_id=eq.${task.job_id}&kind=neq.live&order=created_at.desc&select=id,kind,name,mime,sha256,size`,
      );
      return send(res, 200, { artifacts });
    }
    if (route === "/progress") {
      const data = await readJSON(req);
      requireValue(
        Number.isInteger(data.progress) &&
          data.progress >= 0 &&
          data.progress <= 99 &&
          typeof data.message === "string" &&
          data.message.length <= 500 &&
          uuid(data.event),
        400,
        "Progresso inválido.",
      );
      const accepted = await this.repo.rpc("progress", {
        p_worker: worker.id,
        p_task: id,
        p_lease: lease,
        p_progress: data.progress,
        p_message: data.message,
        p_event: data.event,
      });
      requireValue(accepted, 409, "Concessão expirada.");
      return send(res, 200, { accepted });
    }
    if (route === "/artifact-ticket") {
      const data = await readJSON(req);
      requireValue(
        ["work", "preview", "result", "validation"].includes(data.kind) &&
          typeof data.name === "string" &&
          /^[\w.-]{1,100}$/.test(data.name) &&
          [
            "image/svg+xml",
            "application/json",
            "application/octet-stream",
            "application/pdf",
            "application/dxf",
          ].includes(data.mime) &&
          Number.isInteger(data.size) &&
          data.size > 0 &&
          data.size <= this.auth.config.maxUpload &&
          typeof data.sha256 === "string" &&
          /^[a-f0-9]{64}$/.test(data.sha256),
        400,
        "Artefato inválido ou acima do limite de 25 MB.",
      );
      const artifactId = crypto.randomUUID();
      const ticket = {
        item: {
          id: artifactId,
          kind: data.kind,
          name: data.name,
          mime: data.mime,
          storage_key: `${worker.team_id}/${task.job_id}/${id}/${artifactId}/${data.name}`,
          sha256: data.sha256,
          size: data.size,
        },
        workerId: worker.id,
        taskId: id,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      return send(res, 200, {
        uploadUrl: await this.repo.signedUpload(ticket.item.storage_key),
        ticket,
        signature: signTransfer(this.auth.config, ticket),
      });
    }
    if (route === "/artifact-complete") {
      const { ticket, signature } = await readJSON(req);
      verifyTransfer(this.auth.config, ticket, signature);
      requireValue(
        ticket.workerId === worker.id &&
          ticket.taskId === id &&
          ticket.item?.storage_key?.startsWith(
            `${worker.team_id}/${task.job_id}/${id}/`,
          ),
        403,
        "Artefato não pertence à tarefa.",
      );
      const verified = await verifyStoredFile(this.repo, ticket.item);
      requireValue(
        verified.sha256 === ticket.item.sha256,
        400,
        "Integridade do resultado divergente.",
      );
      return send(res, 200, {
        item: ticket.item,
        receipt: this.receipt(ticket.item),
      });
    }
    if (route === "/artifact") {
      const kind = url.searchParams.get("kind"),
        name = url.searchParams.get("name"),
        mime = req.headers["content-type"];
      requireValue(
        ["work", "preview", "result", "validation"].includes(kind) &&
          typeof name === "string" &&
          /^[\w.-]{1,100}$/.test(name),
        400,
        "Artefato inválido.",
      );
      requireValue(
        [
          "image/svg+xml",
          "application/json",
          "application/octet-stream",
          "application/pdf",
          "application/dxf",
        ].includes(mime),
        415,
        "Formato de resultado inválido.",
      );
      const data = await body(req, this.auth.config.maxUpload);
      const artifactId = crypto.randomUUID(),
        key = `${worker.team_id}/${task.job_id}/${id}/${artifactId}/${name}`;
      await this.repo.upload(key, data, mime);
      const item = {
        id: artifactId,
        kind,
        name,
        mime,
        storage_key: key,
        sha256: hash(data),
        size: data.length,
      };
      return send(res, 200, { item, receipt: this.receipt(item) });
    }
    if (route === "/frame") {
      requireValue(
        worker.live_authorized && worker.capabilities?.corel,
        403,
        "A captura da janela Corel deve ser autorizada localmente.",
      );
      const data = await body(req, 1024 * 1024);
      requireValue(
        data[0] === 255 &&
          data[1] === 216 &&
          req.headers["content-type"] === "image/jpeg",
        415,
        "Captura JPEG inválida.",
      );
      const key = `${worker.team_id}/${task.job_id}/live/${worker.id}.jpg`;
      await this.repo.upload(key, data, "image/jpeg");
      const existing = (
        await this.repo.table(
          "artifacts",
          `?job_id=eq.${task.job_id}&kind=eq.live&task_id=eq.${id}`,
        )
      )[0];
      const item = {
        job_id: task.job_id,
        task_id: id,
        kind: "live",
        name: "corel-ao-vivo.jpg",
        mime: "image/jpeg",
        storage_key: key,
        sha256: hash(data),
        size: data.length,
        created_at: new Date().toISOString(),
      };
      if (existing) await this.repo.update("artifacts", existing.id, item);
      else await this.repo.insert("artifacts", item);
      return send(res, 200, { updatedAt: item.created_at });
    }
    if (route === "/uncertain") {
      const data = await readJSON(req);
      requireValue(
        typeof data.message === "string" && data.message.length <= 500,
        400,
        "Motivo inválido.",
      );
      await this.repo.table(
        "tasks",
        `?id=eq.${id}&worker_id=eq.${worker.id}&lease_token=eq.${lease}&state=eq.running`,
        {
          method: "PATCH",
          data: {
            state: "needs_review",
            message: data.message,
            lease_until: new Date().toISOString(),
          },
        },
      );
      return send(res, 200, { requiresReview: true });
    }
    if (route === "/finish") {
      const data = await readJSON(req, 4 * 1024 * 1024);
      requireValue(
        typeof data.ok === "boolean" &&
          typeof data.message === "string" &&
          data.message.length <= 500 &&
          data.result &&
          typeof data.result === "object" &&
          Array.isArray(data.artifacts) &&
          data.artifacts.length <= 10,
        400,
        "Resultado inválido.",
      );
      const items = data.artifacts.map((record) => {
        requireValue(
          record.item &&
            typeof record.receipt === "string" &&
            record.receipt === this.receipt(record.item) &&
            record.item.storage_key.startsWith(
              `${worker.team_id}/${task.job_id}/${id}/`,
            ),
          403,
          "Artefato não pertence à tarefa.",
        );
        return record.item;
      });
      const accepted = await this.repo.rpc("finish", {
        p_worker: worker.id,
        p_task: id,
        p_lease: lease,
        p_ok: data.ok,
        p_result: data.result,
        p_artifacts: items,
        p_message: data.message,
      });
      requireValue(
        accepted,
        409,
        "Resultado retido: concessão expirada. Requer conferência.",
      );
      return send(res, 200, { accepted });
    }
    requireValue(false, 404, "Operação do computador não encontrada.");
  }
}
