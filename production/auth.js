import crypto from "node:crypto";
import { hash, requireValue, ProductionError } from "./common.js";
export function sessionCodec(secret) {
  requireValue(
    typeof secret === "string" && secret.length >= 32,
    503,
    "Configure PRODUCTION_SESSION_SECRET com pelo menos 32 caracteres.",
  );
  const key = crypto
    .createHash("sha256")
    .update("production-up:" + secret)
    .digest();
  return {
    seal(value) {
      const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
        "base64url",
      );
    },
    open(value) {
      try {
        const bytes = Buffer.from(value, "base64url"),
          decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            key,
            bytes.subarray(0, 12),
          );
        decipher.setAuthTag(bytes.subarray(12, 28));
        const session = JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(28)),
            decipher.final(),
          ]),
        );
        requireValue(session.until > Date.now(), 401, "Sessão expirada.");
        return session;
      } catch {
        throw new ProductionError(
          401,
          "Entre com uma conta de operador autorizada.",
        );
      }
    },
  };
}
export class ProductionAuth {
  constructor(config, repo) {
    this.config = config;
    this.repo = repo;
    this.attempts = new Map();
  }
  cookie(value, maxAge = 28800) {
    return `up_production=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.config.origin.startsWith("https:") ? "; Secure" : ""}`;
  }
  async authCall(route, data) {
    const response = await fetch(
      this.config.supabaseUrl + "/auth/v1/" + route,
      {
        method: data ? "POST" : "GET",
        headers: {
          apikey: this.config.supabaseKey,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(15000),
      },
    );
    requireValue(
      response.ok,
      401,
      "E-mail ou senha inválidos, ou sessão expirada.",
    );
    return response.json();
  }
  async membership(user) {
    const rows = await this.repo.table(
      "operators",
      `?user_id=eq.${user.id}&enabled=eq.true&select=user_id,team_id,role`,
    );
    requireValue(
      rows.length === 1,
      403,
      "Esta conta não está autorizada para a Produção UP.",
    );
    return { ...rows[0], email: user.email };
  }
  async login(email, password, ip) {
    requireValue(
      typeof email === "string" &&
        email.length <= 254 &&
        typeof password === "string" &&
        password.length <= 256,
      400,
      "Informe e-mail e senha.",
    );
    const now = Date.now(),
      key = hash(ip + ":" + email.toLowerCase());
    for (const [id, value] of this.attempts)
      if (value.until < now) this.attempts.delete(id);
    const entry = this.attempts.get(key) || { count: 0, until: now + 900000 };
    requireValue(
      entry.count < 8,
      429,
      "Muitas tentativas. Aguarde 15 minutos.",
    );
    entry.count++;
    this.attempts.set(key, entry);
    const data = await this.authCall("token?grant_type=password", {
      email,
      password,
    });
    await this.membership(data.user);
    this.attempts.delete(key);
    const until = Date.now() + Math.min(data.expires_in * 1000, 8 * 3600000);
    return sessionCodec(this.config.secret).seal({
      access: data.access_token,
      until,
    });
  }
  async operator(req) {
    const bearer = req.headers.authorization?.match(
      /^Bearer (up_mcp_[A-Za-z0-9_-]+)$/,
    )?.[1];
    if (bearer) {
      const tokens = await this.repo.table(
        "tokens",
        `?token_hash=eq.${hash(bearer)}&revoked=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`,
      );
      requireValue(
        tokens.length === 1,
        401,
        "Credencial MCP inválida ou revogada.",
      );
      return {
        ...(await this.membership({ id: tokens[0].user_id })),
        token: true,
      };
    }
    const cookie = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("up_production="))
      ?.slice(14);
    requireValue(cookie, 401, "Entre com uma conta de operador autorizada.");
    const session = sessionCodec(this.config.secret).open(cookie);
    const response = await fetch(this.config.supabaseUrl + "/auth/v1/user", {
      headers: {
        apikey: this.config.supabaseKey,
        Authorization: `Bearer ${session.access}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    requireValue(response.ok, 401, "Sessão expirada. Entre novamente.");
    return this.membership(await response.json());
  }
  sameOrigin(req) {
    requireValue(
      req.headers.origin === this.config.origin,
      403,
      "Origem não autorizada. Reabra o painel no endereço configurado.",
    );
  }
  async worker(req) {
    const token = req.headers.authorization?.match(
      /^Bearer (up_worker_[A-Za-z0-9_-]+)$/,
    )?.[1];
    requireValue(token, 401, "Credencial do computador ausente.");
    const rows = await this.repo.table(
      "workers",
      `?token_hash=eq.${hash(token)}&revoked=eq.false`,
    );
    requireValue(
      rows.length === 1,
      401,
      "Computador não autorizado ou credencial revogada.",
    );
    return rows[0];
  }
}
