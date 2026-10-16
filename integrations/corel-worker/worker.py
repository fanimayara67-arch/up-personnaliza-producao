import argparse
import hashlib
import json
import os
import platform
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from svg_io import read_svg, analysis_summary, export_svg
from engine import nest, validate, checked_svg, export_dxf
from corel import registered_corel, CorelAdapter


class API:
    def __init__(self, base, token, allow_loopback=False):
        parsed = urllib.parse.urlparse(base)
        if (
            parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
            or not (
                parsed.scheme == "https"
                or allow_loopback
                and parsed.scheme == "http"
                and parsed.hostname in ("localhost", "127.0.0.1", "::1")
            )
        ):
            raise ValueError(
                "A API exige HTTPS. HTTP só é permitido explicitamente em loopback local."
            )
        if not token.startswith("up_worker_"):
            raise ValueError("Credencial própria do computador inválida.")
        self.base = base.rstrip("/") + "/api/production/worker"
        self.token = token
        self.signed_transfer = False

    def call(self, path, data=None, raw=None, mime=None, task=None, method="POST"):
        headers = {"Authorization": "Bearer " + self.token}
        if self.signed_transfer:
            headers["X-Production-Transfer"] = "signed-v1"
        if task:
            headers["X-Production-Lease"] = task["lease_token"]
        payload = (
            raw
            if raw is not None
            else json.dumps(data or {}).encode() if method != "GET" else None
        )
        if payload is not None:
            headers["Content-Type"] = mime or "application/json"
        request = urllib.request.Request(
            self.base + path, data=payload, headers=headers, method=method
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            contents = response.read()
            result = (
                json.loads(contents)
                if "json" in response.headers.get("Content-Type", "")
                else contents
            )
            if path == "/hello":
                self.signed_transfer = result.get("signedTransfer") is True
            return result

    @staticmethod
    def storage(url, data=None, mime=None):
        # Signed Storage transfers are anonymous: never forward the worker token.
        parsed = urllib.parse.urlparse(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError("Transferência privada exige endereço HTTPS válido.")
        headers = (
            {"Content-Type": mime, "x-upsert": "false"} if data is not None else {}
        )
        request = urllib.request.Request(
            url, data=data, headers=headers, method="PUT" if data is not None else "GET"
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read(25 * 1024 * 1024 + 1)


class Worker:
    def __init__(self, config, state_dir, allow_loopback=False, live=False):
        self.config = config
        self.state = Path(state_dir).resolve()
        self.state.mkdir(parents=True, exist_ok=True)
        self.api = API(config["url"], config["credential"], allow_loopback)
        self.instance = str(uuid.uuid4())
        self.corel = None
        self.capture = None
        self.current = None
        self.progress = 0
        self.message = "Aguardando tarefa."
        self.stop = threading.Event()
        self.last_error = None
        self.deadline = None
        self.halted = False
        self.lock = open(self.state / "worker.lock", "a+b")
        try:
            if os.name == "nt":
                import msvcrt

                self.lock.seek(0)
                self.lock.write(b"1")
                self.lock.flush()
                self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise ValueError("Já existe um conector usando este diretório de estado.")
        if config.get("corel", {}).get("progid"):
            self.corel = CorelAdapter(config["corel"])
        if live:
            if not self.corel:
                raise ValueError(
                    "CorelDRAW precisa estar conectado para selecionar sua janela."
                )
            from capture import WindowCapture

            self.capture = WindowCapture.authorize(self.corel.hwnd)
        self.capabilities = {
            "operations": [
                "svg:" + op
                for op in ("analyze", "nest", "validate", "preview", "export")
            ]
            + (
                [
                    "corel:" + op
                    for op in ("analyze", "nest", "validate", "preview", "export")
                ]
                if self.corel
                else []
            ),
            "python": platform.python_version(),
            "engine": "Shapely/GEOS real contour nesting",
            "formats": ["svg", "dxf"] + (["cdr", "pdf"] if self.corel else []),
            "corel": (
                {"version": self.corel.version, "progid": config["corel"]["progid"]}
                if self.corel
                else False
            ),
            "ecut": bool(
                self.corel and config.get("corel", {}).get("ecut", {}).get("verified")
            ),
            "capture": "selected Corel HWND only" if self.capture else "not authorized",
        }

    def journal(self, value):
        tmp = self.state / "journal.tmp"
        tmp.write_text(json.dumps(value), encoding="utf-8")
        tmp.replace(self.state / "journal.json")

    def heartbeat(self):
        next_hello = 0
        next_progress = 0
        next_frame = 0
        while not self.stop.wait(1):
            try:
                now = time.monotonic()
                if now >= next_hello:
                    self.api.call(
                        "/hello",
                        {
                            "instance": self.instance,
                            "capabilities": self.capabilities,
                            "liveAuthorized": bool(self.capture),
                        },
                    )
                    next_hello = now + 15
                task = self.current
                if task and self.deadline and now > self.deadline and not self.halted:
                    self.api.call(
                        "/uncertain?task=" + task["id"],
                        {
                            "message": "Tempo máximo excedido. Confira o documento no computador antes de repetir."
                        },
                        task=task,
                    )
                    self.halted = True
                    print(
                        "Tempo máximo excedido. Trabalho retido para conferência; nenhuma repetição automática.",
                        flush=True,
                    )
                if self.halted:
                    continue
                if task and now >= next_progress:
                    self.api.call(
                        "/progress?task=" + task["id"],
                        {
                            "progress": self.progress,
                            "message": self.message,
                            "event": str(uuid.uuid4()),
                        },
                        task=task,
                    )
                    next_progress = now + 20
            except Exception:
                self.last_error = "Atualização de conexão indisponível. O trabalho permanece protegido pela concessão."

    def frames(self):
        # A blocked window renderer must never prevent lease renewal or heartbeats.
        while not self.stop.wait(2):
            task = self.current
            if not task or not self.capture or self.halted:
                continue
            try:
                frame = self.capture.jpeg()
                if frame:
                    self.api.call(
                        "/frame?task=" + task["id"],
                        raw=frame,
                        mime="image/jpeg",
                        task=task,
                    )
            except Exception:
                self.last_error = "Captura indisponível; o processamento continua sem transmissão de outra janela."

    def update(self, value, message):
        self.progress = value
        self.message = message
        self.api.call(
            "/progress?task=" + self.current["id"],
            {"progress": value, "message": message, "event": str(uuid.uuid4())},
            task=self.current,
        )

    def upload(self, kind, name, data, mime):
        if self.api.signed_transfer:
            authorization = self.api.call(
                "/artifact-ticket?task=" + self.current["id"],
                {
                    "kind": kind,
                    "name": name,
                    "mime": mime,
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                },
                task=self.current,
            )
            self.api.storage(authorization["uploadUrl"], data, mime)
            return self.api.call(
                "/artifact-complete?task=" + self.current["id"],
                {
                    "ticket": authorization["ticket"],
                    "signature": authorization["signature"],
                },
                task=self.current,
            )
        return self.api.call(
            "/artifact?"
            + urllib.parse.urlencode(
                {"task": self.current["id"], "kind": kind, "name": name}
            ),
            raw=data,
            mime=mime,
            task=self.current,
        )

    def process(self, task):
        self.current = task
        self.progress = 0
        self.message = "Tarefa adquirida."
        self.deadline = time.monotonic() + min(
            900,
            max(
                180,
                (task["snapshot"].get("parameters") or {}).get("timeLimit", 60) + 120,
            ),
        )
        self.journal({"task": task, "state": "running"})
        folder = self.state / task["id"]
        folder.mkdir(exist_ok=True)
        artifacts = []
        try:
            self.update(
                2, "Recuperando o original privado e verificando sua integridade."
            )
            manifest = self.api.call("/manifest?task=" + task["id"], task=task)[
                "artifacts"
            ]
            original = next(a for a in manifest if a["kind"] == "original")
            data = self.api.call(
                "/file?"
                + urllib.parse.urlencode(
                    {"task": task["id"], "artifact": original["id"]}
                ),
                task=task,
                method="GET",
            )
            if isinstance(data, dict):
                data = self.api.storage(data["downloadUrl"])
            if hashlib.sha256(data).hexdigest() != original["sha256"]:
                raise ValueError("Integridade do original divergente.")
            source_path = folder / ("original" + Path(original["name"]).suffix.lower())
            source_path.write_bytes(data)
            inspection = None
            if source_path.suffix != ".svg":
                if not self.corel:
                    raise ValueError("Aguardando CorelDRAW para este formato.")
                self.update(
                    5, "Abrindo uma cópia no CorelDRAW e inspecionando objetos."
                )
                converted, inspection = self.corel.prepare(source_path, folder)
                data = converted.read_bytes()
            source = read_svg(data)
            operation = task["operation"]
            snapshot = task["snapshot"]
            params = snapshot.get("parameters")
            self.update(
                10, "Contornos fechados analisados com escala física preservada."
            )
            if operation == "analyze":
                summary = analysis_summary(source)
                if inspection:
                    summary["corelInspection"] = inspection
                preview = export_svg(
                    source,
                    [
                        {"pieceId": p["id"], "matrix": [1, 0, 0, 1, 0, 0]}
                        for p in source["pieces"]
                    ],
                    source["width"],
                    source["height"],
                )
                artifacts.append(
                    self.upload("work", "working.svg", data, "image/svg+xml")
                )
                artifacts.append(
                    self.upload("preview", "analysis.svg", preview, "image/svg+xml")
                )
                result = {"analysis": summary}
            else:
                if not params:
                    raise ValueError("Parâmetros da chapa ausentes.")
                if (
                    operation == "nest"
                    and self.config.get("nestingEngine", "up") == "ecut"
                ):
                    if not self.corel:
                        raise ValueError(
                            "O motor eCut exige CorelDRAW e ponte local validados."
                        )
                    request_path = folder / "ecut-request.json"
                    output_path = folder / "ecut-placements.json"
                    working = folder / "ecut-source.svg"
                    working.write_bytes(data)
                    request_path.write_text(
                        json.dumps(
                            {
                                "protocol": "up-production-bridge/1",
                                "sourceSvg": str(working.resolve()),
                                "outputPlacements": str(output_path.resolve()),
                                "parameters": params,
                            }
                        ),
                        encoding="utf-8",
                    )
                    self.update(
                        15,
                        "Ponte eCut acionada. Processando; não há resultados intermediários disponíveis.",
                    )
                    self.corel.ecut(request_path)
                    if not output_path.exists():
                        raise ValueError(
                            "A ponte eCut não devolveu transformações verificáveis. Confira o documento antes de repetir."
                        )
                    result = json.loads(output_path.read_text(encoding="utf-8"))
                    result["validation"] = {
                        "engine": "eCut via ponte local validada; conferência independente GEOS"
                    }
                else:
                    result = (
                        nest(source, params, self.update)
                        if operation == "nest"
                        else snapshot["result"]
                    )
                self.update(
                    85,
                    "Conferindo contornos, quantidades, margens, distâncias e escala.",
                )
                result["validation"] = validate(
                    source, params, result["placements"]
                ) | {
                    k: v
                    for k, v in result.get("validation", {}).items()
                    if k in ("utilization", "elapsedSeconds", "engine")
                }
                preview = checked_svg(source, params, result["placements"])
                result["validation"]["exportScaleChecked"] = True
                if params["format"] == "dxf":
                    result["validation"][
                        "dxfNote"
                    ] = "Curvas linearizadas com tolerância de 0,05 mm; eixos CAD em milímetros. Contornos relidos para conferir escala e fechamento."
                artifacts.append(
                    self.upload(
                        "preview", "nesting-preview.svg", preview, "image/svg+xml"
                    )
                )
                artifacts.append(
                    self.upload(
                        "validation",
                        "validation.json",
                        json.dumps(
                            {
                                "parameters": params,
                                "report": result["validation"],
                                "placements": result["placements"],
                            },
                            ensure_ascii=False,
                        ).encode(),
                        "application/json",
                    )
                )
                if result["validation"]["valid"]:
                    artifacts.append(
                        self.upload("result", "nesting.svg", preview, "image/svg+xml")
                    )
                    if params["format"] == "dxf":
                        destination = folder / "nesting.dxf"
                        export_dxf(source, params, result["placements"], destination)
                        artifacts.append(
                            self.upload(
                                "result",
                                "nesting.dxf",
                                destination.read_bytes(),
                                "application/dxf",
                            )
                        )
                        result["validation"][
                            "dxfNote"
                        ] = "Curvas linearizadas com tolerância máxima declarada de 0,05 mm; eixos CAD em milímetros."
                    if params["format"] in ("cdr", "pdf"):
                        if not self.corel:
                            raise ValueError(
                                "Aguardando CorelDRAW para exportação "
                                + params["format"]
                                + "."
                            )
                        destination = folder / ("nesting." + params["format"])
                        svg_path = folder / "nesting.svg"
                        svg_path.write_bytes(preview)
                        roundtrip = self.corel.export(
                            svg_path,
                            destination,
                            params["format"],
                            params["width"],
                            params["height"],
                        )
                        again = read_svg(roundtrip.read_bytes())
                        if (
                            abs(again["width"] - params["width"]) > 0.05
                            or abs(again["height"] - params["height"]) > 0.05
                        ):
                            raise ValueError("Escala divergente após exportação Corel.")
                        artifacts.append(
                            self.upload(
                                "result",
                                destination.name,
                                destination.read_bytes(),
                                (
                                    "application/pdf"
                                    if params["format"] == "pdf"
                                    else "application/octet-stream"
                                ),
                            )
                        )
            self.update(
                95, "Arquivos privados enviados. Registrando o resultado e o relatório."
            )
            payload = {
                "ok": True,
                "result": result,
                "artifacts": artifacts,
                "message": (
                    "Análise concluída. Informe os parâmetros."
                    if operation == "analyze"
                    else (
                        "Encaixe e conferência concluídos."
                        if result["validation"]["valid"]
                        else "Nem todas as peças couberam com segurança. Confira o relatório e ajuste a chapa."
                    )
                ),
            }
        except Exception as error:
            payload = {
                "ok": False,
                "result": {},
                "artifacts": artifacts,
                "message": (
                    str(error)[:500]
                    if isinstance(error, ValueError)
                    else "Falha no processamento ou na conexão. Confira o documento e o registro local antes de repetir."
                ),
            }
        finally:
            if self.corel:
                self.corel.close()
        self.journal({"task": task, "state": "finished", "payload": payload})
        self.api.call("/finish?task=" + task["id"], payload, task=task)
        self.journal({"state": "acknowledged", "taskId": task["id"]})
        self.current = None
        print(
            "Tarefa finalizada: " + task["id"] + " | " + payload["message"], flush=True
        )

    def run(self, once=False):
        journal = self.state / "journal.json"
        if journal.exists():
            previous = json.loads(journal.read_text(encoding="utf-8"))
            if previous["state"] == "running":
                raise ValueError(
                    "Execução anterior interrompida. Confira o documento e finalize a revisão no painel. Preserve o journal; use outro diretório de estado só após essa conferência."
                )
            if previous["state"] == "finished":
                self.api.call(
                    "/finish?task=" + previous["task"]["id"],
                    previous["payload"],
                    task=previous["task"],
                )
                self.journal(
                    {"state": "acknowledged", "taskId": previous["task"]["id"]}
                )
        self.api.call(
            "/hello",
            {
                "instance": self.instance,
                "capabilities": self.capabilities,
                "liveAuthorized": bool(self.capture),
            },
        )
        thread = threading.Thread(target=self.heartbeat, daemon=True)
        thread.start()
        frame_thread = threading.Thread(target=self.frames, daemon=True)
        frame_thread.start()
        try:
            while True:
                task = self.api.call("/claim", {"instance": self.instance})["task"]
                if task:
                    self.process(task)
                if once:
                    return
                time.sleep(3)
        finally:
            self.stop.set()
            thread.join(timeout=5)
            frame_thread.join(timeout=3)


def main():
    parser = argparse.ArgumentParser(
        description="Conector Produção UP: geometria real e CorelDRAW opcional."
    )
    parser.add_argument(
        "--config", default=str(Path(__file__).with_name("config.local.json"))
    )
    parser.add_argument("--state", default=str(Path(__file__).with_name("state")))
    parser.add_argument("--allow-loopback", action="store_true")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--diagnose", action="store_true")
    args = parser.parse_args()
    if args.diagnose:
        import shapely

        print(
            json.dumps(
                {
                    "windows": os.name == "nt",
                    "python": platform.python_version(),
                    "corelProgIds": registered_corel(),
                    "geometry": shapely.__version__,
                    "geos": shapely.geos_version_string,
                    "ecut": "Requer instalação e perfil validado; não foi presumida API.",
                }
            )
        )
        return
    try:
        Worker(
            json.loads(Path(args.config).read_text(encoding="utf-8-sig")),
            args.state,
            args.allow_loopback,
            args.live,
        ).run(args.once)
    except KeyboardInterrupt:
        print("Conector encerrado. Uma tarefa interrompida exige conferência.")
    except Exception as error:
        print(
            (
                str(error)
                if isinstance(error, ValueError)
                else "Falha de comunicação/configuração. Nenhuma credencial foi registrada."
            ),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
