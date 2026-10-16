"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { productionAPI } from "./api";
export default function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <main className="login-card">
        <a className="brand" href="/" aria-label="UP Personnaliza, loja">
          <img
            src="/assets/branding/up-symbol.png"
            alt=""
            width="55"
            height="55"
          />
          <img
            className="wordmark"
            src="/assets/branding/up-wordmark.png"
            alt="UP Personnaliza"
            width="180"
            height="50"
          />
        </a>
        <p className="eyebrow">ACESSO DOS OPERADORES</p>
        <h1>Produção UP</h1>
        <p>
          Prepare arquivos, organize chapas e acompanhe a produção em um só
          lugar.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await productionAPI("/login", {
                method: "POST",
                body: JSON.stringify({
                  email: form.get("email"),
                  password: form.get("password"),
                }),
              });
              router.replace("/producao/encaixe");
              router.refresh();
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Falha ao entrar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail autorizado
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar na produção"}
          </button>
          <p role="alert">{error}</p>
        </form>
        <p className="hint">
          Acesso reservado às contas autorizadas pela UP Personnaliza. Solicite
          acesso ao administrador da loja.
        </p>
        <a href="/">Voltar à loja</a>
      </main>
    </div>
  );
}
