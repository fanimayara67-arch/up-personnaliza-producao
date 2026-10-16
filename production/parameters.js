import { requireValue } from "./common.js";
export const parameterSchema = {
  type: "object",
  properties: {
    width: { type: "number" },
    height: { type: "number" },
    unit: { type: "string", enum: ["mm", "cm", "in"] },
    margin: { type: "number" },
    gap: { type: "number" },
    rotations: { type: "array", items: { type: "number" } },
    quantities: { type: "object", additionalProperties: { type: "integer" } },
    grain: { type: "string", enum: ["none", "horizontal", "vertical"] },
    allowHoles: { type: "boolean" },
    timeLimit: { type: "number" },
    material: { type: "string" },
    machine: { type: "string" },
    controller: { type: "string" },
    cam: { type: "string" },
    format: { type: "string", enum: ["svg", "cdr", "pdf", "dxf"] },
    kerf: { type: "number" },
    kerfAppliedBy: { type: "string", enum: ["CAM", "none"] },
  },
  required: ["width", "height", "unit"],
  additionalProperties: false,
};
export function normalizeParameters(input, analysis) {
  requireValue(
    input && typeof input === "object" && !Array.isArray(input),
    400,
    "Informe os parâmetros da chapa.",
  );
  for (const key of Object.keys(input))
    requireValue(
      key in parameterSchema.properties,
      400,
      `Parâmetro desconhecido: ${key}`,
    );
  const factor = { mm: 1, cm: 10, in: 25.4 }[input.unit];
  requireValue(factor, 400, "Unidade obrigatória: mm, cm ou in.");
  const number = (key, fallback, min, max) => {
    const n = input[key] ?? fallback;
    requireValue(
      typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
      400,
      `${key}: valor inválido (${min} a ${max}).`,
    );
    return n;
  };
  const width = number("width", undefined, 1, 10000 / factor) * factor,
    height = number("height", undefined, 1, 10000 / factor) * factor;
  const margin = number("margin", 0, 0, 1000 / factor) * factor,
    gap = number("gap", 0, 0, 1000 / factor) * factor;
  requireValue(
    2 * margin < Math.min(width, height),
    400,
    "As margens ocupam toda a chapa.",
  );
  const rotations = input.rotations ?? [0, 90, 180, 270];
  requireValue(
    Array.isArray(rotations) &&
      rotations.length > 0 &&
      rotations.length <= 24 &&
      rotations.every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 360,
      ),
    400,
    "Informe até 24 rotações entre 0 e 359 graus.",
  );
  const grain = input.grain ?? "none";
  requireValue(
    ["none", "horizontal", "vertical"].includes(grain),
    400,
    "Orientação do material inválida.",
  );
  requireValue(
    grain === "none" || rotations.every((v) => v === 0 || v === 180),
    400,
    "Com orientação do material, use somente rotações de 0° e 180°.",
  );
  const quantities = input.quantities ?? {},
    ids = new Set(analysis?.pieces?.map((p) => p.id) || []);
  let total = 0;
  requireValue(
    quantities && typeof quantities === "object" && !Array.isArray(quantities),
    400,
    "Quantidades inválidas.",
  );
  for (const [id, n] of Object.entries(quantities)) {
    requireValue(ids.has(id), 400, `Peça desconhecida: ${id}`);
    requireValue(
      Number.isInteger(n) && n >= 1 && n <= 200,
      400,
      "Quantidade por peça: 1 a 200.",
    );
  }
  for (const id of ids) total += quantities[id] ?? 1;
  requireValue(total <= 200, 400, "Limite de 200 peças por trabalho.");
  requireValue(
    input.allowHoles === undefined || typeof input.allowHoles === "boolean",
    400,
    "Opção de vazados inválida.",
  );
  const format = input.format ?? "svg";
  requireValue(
    ["svg", "cdr", "pdf", "dxf"].includes(format),
    400,
    "Formato não suportado.",
  );
  requireValue(
    ["CAM", "none"].includes(input.kerfAppliedBy ?? "CAM"),
    400,
    "A compensação de corte deve ser definida no CAM.",
  );
  const out = {
    width,
    height,
    unit: "mm",
    margin,
    gap,
    rotations: [...new Set(rotations)],
    quantities,
    grain,
    allowHoles: input.allowHoles ?? false,
    timeLimit: number("timeLimit", 30, 1, 300),
    format,
    kerf: number("kerf", 0, 0, 10 / factor) * factor,
    kerfAppliedBy: input.kerfAppliedBy ?? "CAM",
    tolerance: 0.05,
  };
  for (const key of ["material", "machine", "controller", "cam"]) {
    requireValue(
      input[key] === undefined ||
        (typeof input[key] === "string" && input[key].length <= 150),
      400,
      `${key}: texto inválido.`,
    );
    out[key] = input[key] || "";
  }
  // Naming a machine does not qualify its CAM profile or approve a physical cut.
  out.camPending = true;
  return out;
}
