"use client";

import { CheckCircle2, LogOut, ShieldCheck, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

export function AuthStatus(props: { displayName: string; roleId: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="auth-status">
      <span>
        <strong>{props.displayName}</strong>
        <small>{props.roleId}</small>
      </span>
      <button className="icon-button" onClick={logout} type="button" aria-label="Log out" title="Log out">
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  );
}

export function LoginPanel() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedbackState>({
    kind: "neutral",
    text: "First setup uses admin / admin. PIN is required later for protected actions."
  });

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        totp
      })
    });
    if (result.ok) {
      setFeedback({ kind: "success", text: "Authentication successful" });
      window.location.href = "/";
      return;
    }
    const body = await result.json().catch(() => undefined) as {
      error?: string;
      requiresTotp?: boolean;
      attemptsRemaining?: number;
      retryAfterMs?: number;
    } | undefined;
    if (body?.requiresTotp) {
      setRequiresTotp(true);
      setFeedback({
        kind: totp ? "error" : "warning",
        text: totp ? "Authenticator code failed" : "Password accepted. Authenticator code required."
      });
    } else if (result.status === 429) {
      setFeedback({
        kind: "error",
        text: body?.error ?? `Too many failed attempts. Try again in ${Math.ceil((body?.retryAfterMs ?? 0) / 1000)} seconds.`
      });
    } else {
      const remaining = typeof body?.attemptsRemaining === "number" ? ` ${body.attemptsRemaining} attempt${body.attemptsRemaining === 1 ? "" : "s"} remaining.` : "";
      setFeedback({ kind: "error", text: `${body?.error ?? "Login failed"}.${remaining}` });
    }
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-panel-v1">
        <div className="brand-lockup">
          <span className="brand-mark">
            <ShieldCheck size={17} aria-hidden />
          </span>
          <span>
            <strong>FluxIQ Identity</strong>
            <small>Sign in to continue</small>
          </span>
        </div>
        <AuthFeedback feedback={feedback} />
        <form onSubmit={login} className="auth-form">
          <label><span>Username</span><input name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {requiresTotp ? <small className="auth-field-status success"><CheckCircle2 size={13} aria-hidden />Password accepted</small> : null}
          </label>
          {requiresTotp ? <label>
            <span>Authenticator code</span>
            <input name="totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(digits(event.target.value, 6))} />
            <small className={`auth-field-status ${feedback.kind === "error" ? "error" : "warning"}`}>
              {feedback.kind === "error" ? <XCircle size={13} aria-hidden /> : <ShieldCheck size={13} aria-hidden />}
              {feedback.kind === "error" ? "Code failed" : "Waiting for code"}
            </small>
          </label> : null}
          <button className="button button-primary" disabled={busy || !username || !password || (requiresTotp && totp.length !== 6)} type="submit">
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

type AuthFeedbackState = {
  kind: "neutral" | "success" | "warning" | "error";
  text: string;
};

function AuthFeedback({ feedback }: { feedback: AuthFeedbackState }) {
  if (!feedback.text) return null;
  const Icon = feedback.kind === "error" ? XCircle : feedback.kind === "success" ? CheckCircle2 : ShieldCheck;
  return (
    <div className={`auth-feedback ${feedback.kind}`}>
      <Icon size={16} aria-hidden />
      <span>{feedback.text}</span>
    </div>
  );
}

function digits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}
