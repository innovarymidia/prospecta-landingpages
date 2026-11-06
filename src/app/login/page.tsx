"use client";

import { FormEvent, useState } from "react";
import { Command, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import "./login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar");

      const next = new URLSearchParams(location.search).get("next");
      location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
      setBusy(false);
    }
  }

  function fillDevCredentials() {
    setEmail("admin@prospecta.local");
    setPassword("admin123456");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-icon">
            <Command size={19} />
          </div>
          <span>prospecta</span>
        </div>

        <div className="login-intro">
          <h1>Entre na sua conta</h1>
          <p>Acesse seu painel de prospecção e conversas.</p>
        </div>

        <form onSubmit={submit}>
          <label className="login-label" htmlFor="email">E-mail</label>
          <div className="login-input-wrap">
            <Mail size={16} />
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@prospecta.local"
            />
          </div>

          <label className="login-label" htmlFor="password">Senha</label>
          <div className="login-input-wrap">
            <LockKeyhole size={16} />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="login-submit" disabled={busy}>
            {busy ? "Verificando…" : "Entrar no painel"}
          </button>

          <button
            type="button"
            onClick={fillDevCredentials}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "7px 10px",
              background: "none",
              border: "1px dashed #ced7d0",
              borderRadius: 8,
              fontSize: 11,
              color: "#546459",
              cursor: "pointer",
            }}
          >
            Preencher credenciais padrão locais
          </button>
        </form>

        <div className="login-security">
          <ShieldCheck size={15} />
          <span>Sessão protegida com cookie seguro e expiração automática.</span>
        </div>
      </div>
      <div className="login-caption">PROSPECÇÃO COM CONTROLE E SEGURANÇA</div>
    </main>
  );
}
