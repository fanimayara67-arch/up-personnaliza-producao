import { ProductionError } from "./common.js";
export class ProductionRepository {
  constructor(config) {
    this.config = config;
  }
  async request(
    route,
    { method = "GET", data, headers = {}, raw = false } = {},
  ) {
    const c = this.config;
    const response = await fetch(c.supabaseUrl + route, {
      method,
      headers: {
        apikey: c.supabaseKey,
        Authorization: `Bearer ${c.supabaseKey}`,
        ...(!raw && data !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body: data === undefined ? undefined : raw ? data : JSON.stringify(data),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new ProductionError(
        response.status === 409 ? 409 : 503,
        response.status === 409
          ? "A operação já existe ou o trabalho está ocupado."
          : "Serviço de produção indisponível. Confira a configuração e as migrações.",
      );
    if (response.status === 204) return null;
    return !raw && response.headers.get("content-type")?.includes("json")
      ? response.json()
      : response;
  }
  table(name, query = "", options = {}) {
    return this.request(`/rest/v1/up_production_${name}${query}`, options);
  }
  rpc(name, data) {
    return this.request(`/rest/v1/rpc/up_production_${name}`, {
      method: "POST",
      data,
    });
  }
  async insert(name, data) {
    return (
      await this.table(name, "", {
        method: "POST",
        data,
        headers: { Prefer: "return=representation" },
      })
    )[0];
  }
  async update(name, id, data) {
    return (
      await this.table(name, `?id=eq.${id}`, {
        method: "PATCH",
        data,
        headers: { Prefer: "return=representation" },
      })
    )[0];
  }
  async upload(key, data, mime) {
    await this.request(`/storage/v1/object/${this.config.bucket}/${key}`, {
      method: "POST",
      data,
      raw: true,
      headers: { "Content-Type": mime, "x-upsert": "true" },
    });
  }
  async download(key) {
    return this.request(`/storage/v1/object/${this.config.bucket}/${key}`, {
      raw: true,
    });
  }
  async remove(keys) {
    return this.request(`/storage/v1/object/${this.config.bucket}`, {
      method: "DELETE",
      data: { prefixes: keys },
    });
  }
  storageUrl(relative) {
    const base = this.config.supabaseUrl + "/storage/v1";
    const url = new URL(
      relative.startsWith("/storage/v1/") ? relative : base + relative,
      this.config.supabaseUrl,
    );
    if (
      url.origin !== new URL(this.config.supabaseUrl).origin ||
      url.protocol !== "https:"
    )
      throw new ProductionError(503, "Endereço de armazenamento inválido.");
    return url.href;
  }
  async signedUpload(key) {
    const data = await this.request(
      `/storage/v1/object/upload/sign/${this.config.bucket}/${key}`,
      { method: "POST", data: {} },
    );
    return this.storageUrl(data.url);
  }
  async signedDownload(key, download) {
    const data = await this.request(
      `/storage/v1/object/sign/${this.config.bucket}/${key}`,
      { method: "POST", data: { expiresIn: 60 } },
    );
    const url = new URL(this.storageUrl(data.signedURL));
    if (download) url.searchParams.set("download", download);
    return url.href;
  }
}
