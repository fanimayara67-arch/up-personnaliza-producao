"use client";
import type { Job, Parameters } from "./types";
const defaults: Parameters = {
  width: 1200,
  height: 900,
  unit: "mm",
  margin: 10,
  gap: 5,
  rotations: [0, 90, 180, 270],
  quantities: {},
  grain: "none",
  allowHoles: false,
  timeLimit: 30,
  material: "",
  machine: "",
  controller: "",
  cam: "",
  format: "svg",
  kerf: 0,
  kerfAppliedBy: "CAM",
};
export function ParametersForm({
  job,
  busy,
  onSave,
}: {
  job: Job | null;
  busy: boolean;
  onSave: (parameters: Parameters) => Promise<void>;
}) {
  const p = job?.parameters || defaults;
  return (
    <form
      key={`${job?.id}-${job?.revision}`}
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget),
          result = { ...p };
        for (const key of [
          "width",
          "height",
          "margin",
          "gap",
          "timeLimit",
          "kerf",
        ] as const)
          result[key] = Number(data.get(key));
        for (const key of ["material", "machine", "controller", "cam"] as const)
          result[key] = String(data.get(key) || "");
        result.unit = data.get("unit") as Parameters["unit"];
        result.format = data.get("format") as Parameters["format"];
        result.grain = data.get("grain") as Parameters["grain"];
        result.rotations = String(data.get("rotations"))
          .split(",")
          .map((v) => Number(v.trim()));
        result.allowHoles = data.get("allowHoles") === "on";
        result.quantities = Object.fromEntries(
          (job?.analysis?.pieces || []).map((piece) => [
            piece.id,
            Number(data.get("qty_" + piece.id)),
          ]),
        );
        delete result.camPending;
        delete result.tolerance;
        await onSave(result);
      }}
    >
      <fieldset disabled={busy || !job?.analysis}>
        <legend className="sr-only">Parâmetros de produção</legend>
        <div className="fields two">
          <label>
            Largura
            <input
              name="width"
              type="number"
              min="1"
              step="any"
              required
              defaultValue={p.width}
            />
          </label>
          <label>
            Altura
            <input
              name="height"
              type="number"
              min="1"
              step="any"
              required
              defaultValue={p.height}
            />
          </label>
        </div>
        <label>
          Unidade
          <select name="unit" defaultValue={p.unit}>
            <option value="mm">Milímetros (mm)</option>
            <option value="cm">Centímetros (cm)</option>
            <option value="in">Polegadas (in)</option>
          </select>
        </label>
        <div className="fields two">
          <label>
            Margem externa
            <input
              name="margin"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={p.margin}
            />
          </label>
          <label>
            Entre peças
            <input
              name="gap"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={p.gap}
            />
          </label>
        </div>
        <p className="hint">
          Margem e distância usam a mesma unidade da chapa.
        </p>
        <label>
          Rotações (graus, separadas por vírgula)
          <input
            name="rotations"
            required
            defaultValue={p.rotations.join(", ")}
          />
        </label>
        <label>
          Orientação do material
          <select name="grain" defaultValue={p.grain}>
            <option value="none">Sem orientação</option>
            <option value="horizontal">Horizontal (0° e 180°)</option>
            <option value="vertical">Vertical (0° e 180°)</option>
          </select>
        </label>
        <label className="check">
          <input
            name="allowHoles"
            type="checkbox"
            defaultChecked={p.allowHoles}
          />
          Permitir peças dentro de vazados
        </label>
        <details open>
          <summary>Peças e quantidades</summary>
          {job?.analysis?.pieces.map((piece) => (
            <label key={piece.id}>
              {piece.name}{" "}
              <span className="hint">
                {piece.width.toFixed(2)} × {piece.height.toFixed(2)} mm
              </span>
              <input
                type="number"
                name={"qty_" + piece.id}
                min="1"
                max="200"
                required
                defaultValue={p.quantities[piece.id] || 1}
              />
            </label>
          ))}
        </details>
        <details>
          <summary>Material, máquina e exportação</summary>
          {(
            [
              ["material", "Material"],
              ["machine", "Modelo da máquina"],
              ["controller", "Controlador"],
              ["cam", "Software CAM"],
            ] as const
          ).map(([name, label]) => (
            <label key={name}>
              {label}
              <input name={name} maxLength={150} defaultValue={p[name]} />
            </label>
          ))}
          <label>
            Formato de saída
            <select name="format" defaultValue={p.format}>
              <option value="svg">SVG editável, curvas originais</option>
              <option value="dxf">DXF em mm, curvas linearizadas</option>
              <option value="cdr">CDR editável (requer Corel)</option>
              <option value="pdf">PDF vetorial (requer Corel)</option>
            </select>
          </label>
          <label>
            Tempo máximo (segundos)
            <input
              name="timeLimit"
              type="number"
              min="1"
              max="300"
              required
              defaultValue={p.timeLimit}
            />
          </label>
          <label>
            Largura de corte (na unidade escolhida)
            <input
              name="kerf"
              type="number"
              min="0"
              step="any"
              defaultValue={p.kerf}
            />
          </label>
          <p className="hint">
            A compensação será feita no CAM. O encaixe não aplica um segundo
            deslocamento de corte.
          </p>
        </details>
        <button className="primary full" type="submit">
          Salvar parâmetros
        </button>
      </fieldset>
      {job?.parameters && (
        <p className="hint">
          Confirmado: {p.width} × {p.height} mm; margem {p.margin} mm; entre
          peças {p.gap} mm. Escala original preservada.
        </p>
      )}
    </form>
  );
}
