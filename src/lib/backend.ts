import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApplication } from "../../server.js";
export async function dispatch(request: Request): Promise<Response> {
  const req = (
    request.body
      ? Readable.fromWeb(
          request.body as import("node:stream/web").ReadableStream,
        )
      : Readable.from([])
  ) as IncomingMessage;
  req.url = new URL(request.url).pathname + new URL(request.url).search;
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers);
  req.socket = { remoteAddress: "next-route" } as IncomingMessage["socket"];
  return new Promise<Response>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let status = 200;
    const headers = new Headers();
    const output = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        resolve(
          new Response(
            request.method === "HEAD" ? null : Buffer.concat(chunks),
            { status, headers },
          ),
        );
        done();
      },
    });
    const res = output as unknown as ServerResponse;
    res.writeHead = ((
      code: number,
      values: Record<string, string | string[]>,
    ) => {
      status = code;
      for (const [key, value] of Object.entries(values || {})) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, String(value));
      }
      return res;
    }) as ServerResponse["writeHead"];
    res.setHeader = ((name: string, value: string | string[] | number) => {
      headers.set(
        name,
        Array.isArray(value) ? value.join(", ") : String(value),
      );
      return res;
    }) as ServerResponse["setHeader"];
    res.getHeader = (name: string) => headers.get(name) || undefined;
    Object.defineProperty(res, "headersSent", { get: () => false });
    Promise.resolve(handleApplication(req, res)).catch(reject);
  });
}
