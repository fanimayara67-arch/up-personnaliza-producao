export async function productionAPI<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/production" + path, {
    ...options,
    headers: {
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response.json();
  if (response.status === 401) {
    if (path !== "/login")
      window.dispatchEvent(new Event("up-production-unauthorized"));
    throw new Error(data.error || "Sessão expirada.");
  }
  if (!response.ok)
    throw new Error(data.error || "Não foi possível completar a operação.");
  return data as T;
}

export async function uploadOriginal(jobId: string, file: File): Promise<void> {
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error("Envie um arquivo de até 25 MB.");
  const authorization = await productionAPI<{
    uploadUrl: string;
    ticket: { mime: string } & Record<string, unknown>;
    signature: string;
  }>(`/jobs/${jobId}/upload-ticket`, {
    method: "POST",
    body: JSON.stringify({ name: file.name, size: file.size }),
  });
  const transfer = await fetch(authorization.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": authorization.ticket.mime, "x-upsert": "false" },
    body: file,
    credentials: "omit",
  });
  if (!transfer.ok)
    throw new Error(
      "O envio não foi concluído. Confira a conexão e tente novamente.",
    );
  await productionAPI(`/jobs/${jobId}/upload-complete`, {
    method: "POST",
    body: JSON.stringify({
      ticket: authorization.ticket,
      signature: authorization.signature,
    }),
  });
}
