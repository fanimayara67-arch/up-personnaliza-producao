"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { productionAPI as api, uploadOriginal } from "./api";
import { ParametersForm } from "./ParametersForm";
import { Preview } from "./Preview";
import {
  states,
  type Job,
  type JobState,
  type Operator,
  type Parameters,
  type Worker,
} from "./types";
import { useClock } from "./useClock";
import { useRouter } from "next/navigation";
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
export default function ProductionPanel({ operator }: { operator: Operator }) {
  const router = useRouter();
  useEffect(() => {
    const expired = () => {
      router.replace("/producao/login");
      router.refresh();
    };
    window.addEventListener("up-production-unauthorized", expired);
    return () =>
      window.removeEventListener("up-production-unauthorized", expired);
  }, [router]);
  const [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<JobState | null>(null),
    [workers, setWorkers] = useState<Worker[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false),
    [panel, setPanel] = useState("workspace"),
    [credential, setCredential] = useState(""),
    [chatText, setChatText] = useState("");
  const newDialog = useRef<HTMLDialogElement>(null),
    settingsDialog = useRef<HTMLDialogElement>(null);
  const activeId = useRef(selected);
  const now = useClock();
  useEffect(() => {
    activeId.current = selected;
  }, [selected]);
  const notify = useCallback((text: string, isError = false) => {
    setNotice(text);
    setError(isError);
  }, []);
  const refreshJobs = useCallback(async () => {
    const result = await api<{ jobs: Job[] }>("/jobs");
    setJobs(result.jobs);
  }, []);
  const refresh = useCallback(async () => {
    if (!selected) return;
    const result = await api<JobState>("/jobs/" + selected);
    if (activeId.current === selected) {
      setData(result);
      setWorkers(result.workers);
    }
  }, [selected]);
  useEffect(() => {
    let alive = true;
    api<{ jobs: Job[] }>("/jobs")
      .then((result) => {
        if (alive) {
          setJobs(result.jobs);
          const requested = new URLSearchParams(location.search).get("job");
          if (requested && result.jobs.some((j) => j.id === requested))
            setSelected(requested);
        }
      })
      .catch((problem) => notify(problem.message, true));
    api<{ workers: Worker[] }>("/session")
      .then((result) => {
        if (alive) setWorkers(result.workers);
      })
      .catch((problem) => notify(problem.message, true));
    return () => {
      alive = false;
    };
  }, [notify]);
  useEffect(() => {
    if (!selected) return;
    let stopped = false,
      running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api<JobState>("/jobs/" + selected);
        if (!stopped) {
          setData(result);
          setWorkers(result.workers);
        }
      } catch (problem) {
        if (!stopped)
          notify(
            problem instanceof Error
              ? problem.message
              : "Conexão indisponível.",
            true,
          );
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [selected, notify]);
  async function perform(action: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await Promise.all([refresh(), refreshJobs()]);
      if (message) notify(message);
    } catch (problem) {
      notify(
        problem instanceof Error ? problem.message : "Falha na operação.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string) {
    setSelected(id);
    setData(null);
    setNotice("");
    history.replaceState(null, "", id ? "?job=" + id : location.pathname);
  }
  const job = data?.job || null,
    task = data?.tasks[0],
    activeTask =
      task && ["queued", "running", "needs_review"].includes(task.state),
    processing = Boolean(task?.state === "running"),
    online = workers.filter(
      (w) =>
        now &&
        !w.revoked &&
        w.heartbeat_at &&
        now - new Date(w.heartbeat_at).getTime() < 35000,
    );
  const tool = (name: string) =>
    perform(
      () =>
        api("/jobs/" + selected + "/tools/" + name, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: "{}",
        }),
      "Operação registrada na fila. Acompanhe o progresso abaixo.",
    );
  return (
    <>
      <a className="skip" href="#workspace">
        Ir para o trabalho
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="UP Personnaliza, loja">
          <img
            src="/assets/branding/up-symbol.png"
            width="42"
            height="42"
            alt=""
          />
          <img
            className="wordmark"
            src="/assets/branding/up-wordmark.png"
            width="140"
            height="36"
            alt="UP Personnaliza"
          />
        </a>
        <div className="area-title">
          <strong>Produção UP</strong>
          <span>Encaixe de peças</span>
        </div>
        <span className="connection">
          {online.length
            ? online.some((w) => w.capabilities.corel)
              ? "Computador de produção conectado"
              : "Motor UP conectado • Corel indisponível"
            : "Computador desconectado"}
        </span>
        <button onClick={() => settingsDialog.current?.showModal()}>
          Configurações
        </button>
        <button
          onClick={() =>
            void perform(async () => {
              await api("/logout", { method: "POST", body: "{}" });
              router.replace("/producao/login");
              router.refresh();
            })
          }
        >
          Sair
        </button>
      </header>
      {notice && (
        <div
          className={"notice" + (error ? " error" : "")}
          role={error ? "alert" : "status"}
        >
          {notice}
        </div>
      )}
      <nav className="mobile-nav" aria-label="Áreas da produção">
        {(
          [
            ["parameters", "Parâmetros"],
            ["workspace", "Visualização"],
            ["assistant", "Assistente"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={panel === id}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="production-layout">
        <aside
          id="parameters"
          className={
            "parameters panel " + (panel === "parameters" ? "active-panel" : "")
          }
        >
          <div className="panel-heading">
            <h2>Trabalhos</h2>
            <button
              className="primary"
              onClick={() => newDialog.current?.showModal()}
            >
              Novo trabalho
            </button>
          </div>
          <label>
            Histórico recente
            <select
              value={selected}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="">Selecione um trabalho</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} • {states[j.state] || j.state}
                </option>
              ))}
            </select>
          </label>
          <div className="job-heading">
            <p className="eyebrow">CONFIGURAÇÃO DA CHAPA</p>
            <h2>{job?.name || "Comece um trabalho"}</h2>
            <p className="state">
              {job
                ? task?.state === "needs_review"
                  ? "Conferência necessária após interrupção"
                  : states[job.state] || job.state
                : "Envie um arquivo para analisar os contornos."}
            </p>
          </div>
          {job?.state === "awaiting_file" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const file = new FormData(event.currentTarget).get(
                  "file",
                ) as File;
                void perform(async () => {
                  await uploadOriginal(selected, file);
                  await api("/jobs/" + selected + "/tools/analisar_arquivo", {
                    method: "POST",
                    body: "{}",
                    headers: { "Idempotency-Key": crypto.randomUUID() },
                  });
                }, "Original enviado. A análise está na fila.");
              }}
            >
              <label>
                Arquivo original
                <input
                  type="file"
                  name="file"
                  accept=".svg,.cdr,.pdf,.dxf,.eps"
                  required
                />
              </label>
              <button className="primary full" disabled={busy}>
                Enviar original e analisar
              </button>
            </form>
          )}
          <ParametersForm
            job={job}
            busy={busy || Boolean(activeTask)}
            onSave={async (parameters: Parameters) =>
              perform(
                () =>
                  api("/jobs/" + selected + "/tools/configurar_chapa", {
                    method: "POST",
                    body: JSON.stringify(parameters),
                  }),
                "Parâmetros confirmados. A escala das peças foi preservada.",
              )
            }
          />
          {job?.analysis?.warnings.map((warning, index) => (
            <p key={index} className="hint">
              {warning}
            </p>
          ))}
        </aside>
        <section
          id="workspace"
          className={
            "workspace panel " + (panel === "workspace" ? "active-panel" : "")
          }
          aria-label="Visualização e andamento"
        >
          <Preview
            artifacts={data?.artifacts || []}
            workers={workers}
            activeWorker={task?.worker_id}
            processing={processing}
          />
          <div className="actions">
            {(
              [
                ["analisar_arquivo", "Analisar arquivo"],
                ["executar_encaixe", "Executar encaixe"],
                ["validar_resultado", "Conferir"],
                ["exportar_arquivo", "Exportar"],
              ] as const
            ).map(([name, label]) => (
              <button
                key={name}
                className={name === "executar_encaixe" ? "primary" : ""}
                disabled={
                  busy ||
                  !job ||
                  Boolean(activeTask) ||
                  (name !== "analisar_arquivo" && !job.parameters)
                }
                onClick={() => void tool(name)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="progress-block">
            <label htmlFor="progress">Andamento real</label>
            <progress id="progress" max="100" value={task?.progress || 0} />
            <p>
              {task?.state === "queued"
                ? "Aguardando um computador com capacidade para este arquivo. Inicie o conector para continuar."
                : task?.message || "Nenhuma operação em execução."}
            </p>
            {task?.state === "needs_review" && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(
                    () =>
                      api("/jobs/" + selected + "/review", {
                        method: "POST",
                        body: JSON.stringify({ task: task.id }),
                      }),
                    "Conferência registrada. Uma nova execução depende do seu comando.",
                  )
                }
              >
                Conferi o documento da tarefa interrompida
              </button>
            )}
          </div>
          {job?.validation && (
            <div
              className={
                "validation " + (!job.validation.valid ? "invalid" : "")
              }
            >
              <strong>
                {job.validation.valid
                  ? "Conferência geométrica aprovada"
                  : "Resultado precisa de ajuste"}
              </strong>
              <p>
                {job.validation.pieces} de {job.validation.expected} peças.{" "}
                {job.validation.utilization !== undefined
                  ? "Aproveitamento: " +
                    (job.validation.utilization * 100).toFixed(1) +
                    "%."
                  : ""}
              </p>
              {job.validation.errors.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
              <p>
                Preparação do corte:{" "}
                {job.validation.camPending
                  ? "identifique e valide máquina, controlador e CAM."
                  : "confira o perfil CAM e os percursos na máquina."}{" "}
                Compensação não aplicada ao encaixe.
              </p>
            </div>
          )}
          <details className="downloads" open>
            <summary>Arquivos e relatório</summary>
            <ul>
              {data?.artifacts
                .filter((a) => a.kind !== "live")
                .map((a) => (
                  <li key={a.id}>
                    <a href={"/api/production/files/" + a.id}>{a.name}</a>{" "}
                    <span className="hint">
                      ({(a.size / 1024).toFixed(1)} KB) • {date(a.created_at)}
                    </span>
                  </li>
                )) || <li>Os arquivos aparecem após o processamento.</li>}
            </ul>
          </details>
          <details className="timeline" open>
            <summary>Linha do tempo</summary>
            <ol>
              {data?.events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.created_at}>
                    {date(event.created_at)}
                  </time>
                  {event.message}
                </li>
              )) || <li>As ações executadas serão registradas aqui.</li>}
            </ol>
          </details>
        </section>
        <aside
          id="assistant"
          className={
            "assistant panel " + (panel === "assistant" ? "active-panel" : "")
          }
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ASSISTENTE UP</p>
              <h2>Vamos preparar sua chapa.</h2>
            </div>
            <span className="agent-mark" aria-hidden="true">
              UP
            </span>
          </div>
          <p className="hint">
            Converse sobre medidas, peças e encaixe. Confira os parâmetros
            interpretados antes de produzir.
          </p>
          <div
            className="messages"
            role="log"
            aria-label="Conversa com o Assistente UP"
          >
            {data?.messages.length ? (
              data.messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    "message " +
                    (message.role === "user"
                      ? "user-message"
                      : "assistant-message")
                  }
                >
                  <b>{message.role === "user" ? "Você" : "Assistente UP"}</b>
                  {message.content}
                </div>
              ))
            ) : (
              <div className="message assistant-message">
                Crie um trabalho e envie seu arquivo. Depois, diga as medidas da
                chapa e a distância entre as peças.
              </div>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const message = chatText;
              setChatText("");
              void perform(() =>
                api("/jobs/" + selected + "/chat", {
                  method: "POST",
                  body: JSON.stringify({ message }),
                }),
              );
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              Mensagem para o Assistente UP
            </label>
            <textarea
              id="chat-input"
              rows={3}
              maxLength={4000}
              required
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Ex.: encaixe em uma chapa de 120 × 90 cm, com 5 mm entre as peças."
            />
            <button className="primary full" disabled={!job || busy}>
              {busy ? "Aguardando resposta…" : "Enviar ao Assistente UP"}
            </button>
            <p className="hint">
              O assistente usa ferramentas. Progresso e resultados vêm do
              computador de produção.
            </p>
          </form>
        </aside>
      </main>
      <dialog ref={newDialog}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget,
              fields = new FormData(form),
              file = fields.get("file") as File;
            await perform(async () => {
              const job = await api<Job>("/jobs", {
                method: "POST",
                body: JSON.stringify({ name: fields.get("name") }),
              });
              choose(job.id);
              await uploadOriginal(job.id, file);
              await api("/jobs/" + job.id + "/tools/analisar_arquivo", {
                method: "POST",
                body: "{}",
                headers: { "Idempotency-Key": crypto.randomUUID() },
              });
              newDialog.current?.close();
              form.reset();
            }, "Original enviado. A análise está na fila do computador.");
          }}
        >
          <div className="panel-heading">
            <h2>Novo trabalho</h2>
            <button
              type="button"
              onClick={() => newDialog.current?.close()}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <label>
            Nome do trabalho
            <input
              name="name"
              required
              maxLength={150}
              placeholder="Ex.: Letras fachada • Cliente"
            />
          </label>
          <label>
            Arquivo original
            <input
              name="file"
              type="file"
              accept=".svg,.cdr,.pdf,.dxf,.eps"
              required
            />
          </label>
          <p className="hint">
            Até 25 MB. SVG deve conter medidas físicas e textos convertidos em
            curvas. Outros formatos precisam do CorelDRAW conectado. O original
            é preservado.
          </p>
          <button className="primary full" disabled={busy}>
            {busy ? "Enviando…" : "Enviar e analisar"}
          </button>
        </form>
      </dialog>
      <dialog ref={settingsDialog} onClose={() => setCredential("")}>
        <div className="panel-heading">
          <h2>Computadores de produção</h2>
          <button
            onClick={() => settingsDialog.current?.close()}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <p>
          A captura é selecionada e autorizada no computador. Somente a janela
          CorelDRAW escolhida será transmitida.
        </p>
        <ul>
          {workers.map((w) => (
            <li key={w.id}>
              <strong>{w.name}</strong>
              <p>
                {w.revoked
                  ? "Credencial revogada"
                  : w.heartbeat_at
                    ? "Última conexão: " + date(w.heartbeat_at)
                    : "Aguardando primeira conexão"}
                .{" "}
                {w.capabilities.corel
                  ? "Corel " + w.capabilities.corel.version
                  : "Corel não conectado"}
                .{" "}
                {w.live_authorized
                  ? "Captura autorizada localmente."
                  : "Captura não autorizada."}
              </p>
              {operator.role === "admin" && !w.revoked && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await api("/workers/" + w.id + "/revoke", {
                        method: "POST",
                        body: "{}",
                      });
                      setWorkers(
                        (await api<{ workers: Worker[] }>("/session")).workers,
                      );
                    }, "Credencial do computador revogada.")
                  }
                >
                  Revogar computador
                </button>
              )}
            </li>
          ))}
        </ul>
        {operator.role === "admin" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              void perform(async () => {
                const result = await api<{ credential: string }>("/workers", {
                  method: "POST",
                  body: JSON.stringify({ name: fields.get("name") }),
                });
                setCredential(result.credential);
                setWorkers(
                  (await api<{ workers: Worker[] }>("/session")).workers,
                );
              });
            }}
          >
            <label>
              Nome do computador
              <input name="name" required maxLength={100} />
            </label>
            <button className="primary" disabled={busy}>
              Autorizar novo computador
            </button>
          </form>
        )}
        {credential && (
          <div>
            <p>
              Credencial exibida uma única vez. Salve na configuração local do
              conector; não compartilhe no chat.
            </p>
            <label>
              Credencial do computador
              <textarea readOnly value={credential} />
            </label>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(credential)
                  .then(() => notify("Credencial copiada."))
              }
            >
              Copiar credencial
            </button>
          </div>
        )}
        <p className="hint">
          Material, máquina, controlador e CAM são registrados nos parâmetros de
          cada trabalho. O percurso de corte depende da validação do
          equipamento.
        </p>
      </dialog>
    </>
  );
}
