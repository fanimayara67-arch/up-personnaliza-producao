"use client";
import { useRef, useState } from "react";
import type { Artifact, Worker } from "./types";
import { useClock } from "./useClock";
const date = (value: string) => new Date(value).toLocaleTimeString("pt-BR");
export function Preview({
  artifacts,
  workers,
  activeWorker,
  processing,
}: {
  artifacts: Artifact[];
  workers: Worker[];
  activeWorker?: string | null;
  processing: boolean;
}) {
  const [mode, setMode] = useState<"vector" | "live">("vector"),
    [zoom, setZoom] = useState(100),
    [expanded, setExpanded] = useState(false);
  const viewport = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const preview = artifacts.filter((a) => a.kind === "preview").at(-1),
    frame = artifacts.filter((a) => a.kind === "live").at(-1);
  const worker =
    workers.find((w) => w.id === activeWorker) ||
    workers.find((w) => w.capabilities.corel && !w.revoked);
  const now = useClock();
  const connected = Boolean(
    now &&
    worker?.heartbeat_at &&
    !worker.revoked &&
    now - new Date(worker.heartbeat_at).getTime() < 35000,
  );
  const fresh = Boolean(
    frame &&
    now &&
    now - new Date(frame.created_at).getTime() < 12000 &&
    connected &&
    worker?.live_authorized,
  );
  const liveTitle = !connected
    ? "Computador desconectado"
    : !worker?.capabilities.corel
      ? "CorelDRAW indisponível"
      : !worker.live_authorized
        ? "Captura não autorizada"
        : "Aguardando atualização do Corel";
  const file = (a: Artifact) =>
    `/api/production/files/${a.id}?view=1&t=${encodeURIComponent(a.created_at)}`;
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">ÁREA DE TRABALHO</p>
          <h1>Encaixe por contornos</h1>
        </div>
        <button
          onClick={() => {
            setExpanded(!expanded);
            document.documentElement.classList.toggle("expanded", !expanded);
          }}
        >
          {expanded ? "Reduzir" : "Ampliar"}
        </button>
      </div>
      <div
        className="mode-switch"
        role="group"
        aria-label="Modo de visualização"
      >
        <button
          aria-pressed={mode === "vector"}
          onClick={() => {
            setMode("vector");
            setZoom(100);
          }}
        >
          Prévia do arquivo
        </button>
        <button
          aria-pressed={mode === "live"}
          onClick={() => {
            setMode("live");
            setZoom(100);
          }}
        >
          Acompanhar ao vivo
        </button>
      </div>
      <div className="view-meta">
        <strong>
          {mode === "vector"
            ? "Prévia do arquivo"
            : fresh
              ? "Corel ao vivo"
              : liveTitle}
        </strong>
        <span>
          {(mode === "vector" ? preview : frame)
            ? "Atualização: " +
              date((mode === "vector" ? preview : frame)!.created_at)
            : "Sem resultados disponíveis"}
        </span>
      </div>
      <div
        className="viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Visualização. Arraste para mover ou use os controles de zoom."
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            e.currentTarget.scrollLeft = d.left + d.x - e.clientX;
            e.currentTarget.scrollTop = d.top + d.y - e.clientY;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {mode === "vector" ? (
          preview ? (
            <img
              src={file(preview)}
              alt="Prévia vetorial do trabalho"
              style={{ width: `${zoom * 0.9}%` }}
            />
          ) : (
            <div>
              <strong>Do arquivo à chapa.</strong>
              <p>
                Envie um vetor e defina as medidas. Os resultados aparecem aqui
                após cada etapa concluída.
              </p>
            </div>
          )
        ) : fresh && frame ? (
          <img
            src={file(frame)}
            alt="Janela CorelDRAW autorizada no computador de produção"
            style={{ width: `${zoom * 0.9}%` }}
          />
        ) : (
          <div>
            <strong>{liveTitle}</strong>
            <p>
              {processing && connected
                ? "A operação continua em processamento. Quando houver uma nova captura ou resultado intermediário, a visualização será atualizada."
                : connected && worker?.live_authorized
                  ? "Nenhuma captura recente disponível. A janela é atualizada durante o processamento; a última atualização continua identificada acima."
                  : "Conecte o CorelDRAW e autorize a captura da janela no computador de produção."}
            </p>
          </div>
        )}
      </div>
      <div
        className="zoom-tools"
        role="group"
        aria-label="Zoom da visualização"
      >
        <button
          aria-label="Diminuir zoom"
          onClick={() => setZoom(Math.max(25, zoom - 25))}
        >
          −
        </button>
        <output aria-label="Nível de zoom">{zoom}%</output>
        <button
          aria-label="Aumentar zoom"
          onClick={() => setZoom(Math.min(500, zoom + 25))}
        >
          +
        </button>
        <button onClick={() => setZoom(100)}>Ajustar</button>
      </div>
    </>
  );
}
