import crypto from "node:crypto";
export class ProductionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const requireValue = (condition, status, message) => {
  if (!condition) throw new ProductionError(status, message);
};
export const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export async function body(req, limit = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    requireValue(size <= limit, 413, "Arquivo ou mensagem acima do limite.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function readJSON(req, limit = 65536) {
  try {
    return JSON.parse((await body(req, limit)).toString("utf8"));
  } catch (error) {
    if (error.status) throw error;
    throw new ProductionError(400, "JSON inválido.");
  }
}
export function send(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(value));
}
