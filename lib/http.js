export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new HttpError(status, code, message); }
export async function readBody(req, limit = 131072) {
  if (Number(req.headers['content-length']) > limit) fail(413, 'body_too_large', 'O arquivo ou pedido excede o tamanho permitido.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, 'body_too_large', 'O arquivo ou pedido excede o tamanho permitido.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'json_required', 'Envie os dados em JSON.');
  try { return JSON.parse((await readBody(req)).toString('utf8')); }
  catch (error) { if (error instanceof HttpError) throw error; fail(400, 'invalid_json', 'Os dados enviados são inválidos.'); }
}
export function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
