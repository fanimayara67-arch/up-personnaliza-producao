import crypto from "node:crypto";
import { requireValue, hash } from "./common.js";
export function signTransfer(config, value) {
  return crypto
    .createHmac("sha256", config.secret)
    .update(JSON.stringify(value))
    .digest("base64url");
}
export function verifyTransfer(config, value, signature) {
  requireValue(
    value &&
      typeof value === "object" &&
      typeof signature === "string" &&
      signature.length < 100,
    403,
    "Autorização de arquivo inválida.",
  );
  const expected = Buffer.from(signTransfer(config, value)),
    provided = Buffer.from(signature);
  requireValue(
    expected.length === provided.length &&
      crypto.timingSafeEqual(expected, provided) &&
      value.expiresAt > Date.now(),
    403,
    "Autorização de arquivo expirada ou inválida.",
  );
}
export function originalInfo(name) {
  requireValue(
    typeof name === "string" &&
      name.length > 0 &&
      name.length <= 180 &&
      !/[\\/\x00-\x1f]/.test(name),
    400,
    "Nome de arquivo inválido.",
  );
  const extension = name.split(".").pop().toLowerCase();
  requireValue(
    ["svg", "cdr", "pdf", "dxf", "eps"].includes(extension),
    415,
    "Envie SVG, CDR, PDF, DXF ou EPS.",
  );
  return {
    extension,
    mime:
      extension === "svg"
        ? "image/svg+xml"
        : extension === "pdf"
          ? "application/pdf"
          : "application/octet-stream",
  };
}
export async function verifyStoredFile(repo, item) {
  const response = await repo.download(item.storage_key),
    declared = Number(response.headers.get("content-length"));
  requireValue(
    !declared || declared <= repo.config.maxUpload,
    413,
    "Arquivo acima do limite de 25 MB.",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  requireValue(
    bytes.length === item.size && bytes.length <= repo.config.maxUpload,
    400,
    "O tamanho recebido é diferente do autorizado.",
  );
  return { bytes, sha256: hash(bytes) };
}
