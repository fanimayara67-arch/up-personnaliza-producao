import { ProductionRepository } from "./repository.js";
import { ProductionAuth } from "./auth.js";
import { ProductionService } from "./service.js";
import { WorkerAPI } from "./worker-api.js";
import { body, readJSON, requireValue, send, uuid } from "./common.js";
import { chat } from "./assistant.js";
export function createProduction({ config }) {
  const repo = new ProductionRepository(config),
    auth = new ProductionAuth(config, repo),
    service = new ProductionService(repo),
    workerAPI = new WorkerAPI(repo, auth);
  return {
    service,
    auth,
    repo,
    async handle(req, res, url) {
      const route = url.pathname;
      if (!route.startsWith("/api/production/")) return false;
      try {
        requireValue(config.enabled, 404, "Produção UP indisponível.");
        requireValue(
          config.supabaseKey && config.supabaseUrl && config.secret,
          503,
          "Configure o backend da Produção UP.",
        );
        if (route.startsWith("/api/production/worker/"))
          return await workerAPI.handle(req, res, url);
        if (route === "/api/production/login" && req.method === "POST") {
          auth.sameOrigin(req);
          const data = await readJSON(req),
            session = await auth.login(
              data.email,
              data.password,
              req.socket.remoteAddress || "",
            );
          return send(
            res,
            200,
            { ok: true },
            { "Set-Cookie": auth.cookie(session) },
          );
        }
        const operator = await auth.operator(req);
        if (!["GET", "HEAD"].includes(req.method) && !operator.token)
          auth.sameOrigin(req);
        if (route === "/api/production/logout" && req.method === "POST")
          return send(
            res,
            200,
            { ok: true },
            { "Set-Cookie": auth.cookie("", 0) },
          );
        if (route === "/api/production/session" && req.method === "GET")
          return send(res, 200, {
            operator,
            workers: await service.workers(operator),
            aiConfigured: Boolean(config.gatewayKey && config.model),
            model: config.model,
          });
        if (route === "/api/production/jobs") {
          if (req.method === "GET")
            return send(res, 200, {
              jobs: await repo.table(
                "jobs",
                `?team_id=eq.${operator.team_id}&order=updated_at.desc&limit=100&select=id,name,state,created_at,updated_at`,
              ),
            });
          if (req.method === "POST")
            return send(
              res,
              201,
              await service.create(operator, (await readJSON(req)).name),
            );
        }
        if (route === "/api/production/workers" && req.method === "POST")
          return send(
            res,
            201,
            await service.enroll(operator, (await readJSON(req)).name),
          );
        const revoke = route.match(
          /^\/api\/production\/workers\/([\w-]+)\/revoke$/,
        );
        if (revoke && req.method === "POST") {
          requireValue(
            operator.role === "admin" && uuid(revoke[1]),
            403,
            "Permissão insuficiente.",
          );
          await repo.table(
            "workers",
            `?id=eq.${revoke[1]}&team_id=eq.${operator.team_id}`,
            {
              method: "PATCH",
              data: { revoked: true, live_authorized: false },
            },
          );
          return send(res, 200, { revoked: true });
        }
        const match = route.match(
          /^\/api\/production\/jobs\/([\w-]+)(?:\/(upload|upload-ticket|upload-complete|chat|review|tools\/([\w_]+)))?$/,
        );
        if (match) {
          const id = match[1];
          if (match[2] === "upload-ticket" && req.method === "POST") {
            const data = await readJSON(req);
            return send(
              res,
              200,
              await service.uploadTicket(operator, id, data.name, data.size),
            );
          }
          if (match[2] === "upload-complete" && req.method === "POST")
            return send(
              res,
              201,
              await service.completeUpload(operator, id, await readJSON(req)),
            );
          if (!match[2] && req.method === "GET")
            return send(res, 200, await service.status(operator, id));
          if (match[2] === "upload" && req.method === "POST")
            return send(
              res,
              201,
              await service.upload(
                operator,
                id,
                url.searchParams.get("name"),
                await body(req, config.maxUpload),
              ),
            );
          if (match[2] === "chat" && req.method === "POST")
            return send(
              res,
              200,
              await chat(
                service,
                config,
                operator,
                id,
                (await readJSON(req)).message,
              ),
            );
          if (match[2] === "review" && req.method === "POST")
            return send(
              res,
              200,
              await service.review(operator, id, (await readJSON(req)).task),
            );
          if (match[3] && req.method === "POST")
            return send(
              res,
              200,
              await service.execute(
                operator,
                id,
                match[3],
                await readJSON(req),
                req.headers["idempotency-key"],
              ),
            );
        }
        const file = route.match(/^\/api\/production\/files\/([\w-]+)$/);
        if (file && req.method === "GET") {
          requireValue(uuid(file[1]), 400, "Arquivo inválido.");
          const item = (await repo.table("artifacts", `?id=eq.${file[1]}`))[0];
          requireValue(item, 404, "Arquivo não encontrado.");
          await service.job(operator, item.job_id);
          const signed = await repo.signedDownload(
            item.storage_key,
            url.searchParams.get("view") === "1" &&
              ["preview", "live"].includes(item.kind)
              ? null
              : item.name,
          );
          res.writeHead(302, {
            "Cache-Control": "no-store",
            Location: signed,
            "Referrer-Policy": "no-referrer",
          });
          res.end();
          return;
        }
        requireValue(
          false,
          404,
          "Página ou operação de produção não encontrada.",
        );
      } catch (error) {
        if (!res.headersSent)
          send(res, error.status || 500, {
            error: error.status
              ? error.message
              : "Falha interna na Produção UP. Confira os serviços e tente novamente.",
          });
        else res.end();
      }
    },
  };
}
