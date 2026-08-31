"use client";

import { Blocks, CheckCircle2, Eye, EyeOff, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Breadcrumb, Button, Field, IconButton, InlineNotice, Menu, type AlertTone, type BreadcrumbItem } from "../features/programs/shared-ui";

export function AuthStatus(props: { displayName: string; roleId: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return <div className="auth-status"><Menu icon={<UserRound aria-hidden size={15} />} label={props.displayName} options={[
    { id: "account", label: "Account and access", href: "/programs/identity-access", icon: <Settings aria-hidden size={14} /> },
    { id: "logout", label: "Log out", onSelect: () => void logout(), icon: <LogOut aria-hidden size={14} /> }
  ]} /><span className="auth-role">{props.roleId}</span></div>;
}

export function GlobalTopbar(props: {
  user: { displayName: string; roleId: string };
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
}) {
  return (
    <header className="directory-topbar global-topbar">
      <Link aria-label="FluxIQ programs" className="brand-lockup" href="/"><span className="brand-mark"><Blocks aria-hidden size={17} /></span><span>FluxIQ</span></Link>
      {props.breadcrumbs?.length ? <div className="global-topbar-context"><Breadcrumb items={props.breadcrumbs} /></div> : null}
      {props.actions ? <div className="global-topbar-actions">{props.actions}</div> : null}
      <AuthStatus displayName={props.user.displayName} roleId={props.user.roleId} />
    </header>
  );
}
type LoginPayload = {
  user?: { id?: string; username?: string };
  requiresCredentialSetup?: boolean;
};

export function LoginPanel() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [setupUserId, setSetupUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{ tone: AlertTone; title: string; message: string } | null>(null);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = window.setInterval(() => setRateLimitSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [rateLimitSeconds]);

  function readCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || rateLimitSeconds > 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, totp })
      });
      const body = await response.json().catch(() => undefined) as {
        error?: string;
        requiresTotp?: boolean;
        attemptsRemaining?: number;
        retryAfterMs?: number;
        payload?: LoginPayload;
      } | undefined;
      if (response.ok) {
        if (body?.payload?.requiresCredentialSetup && body.payload.user?.id) {
          setSetupUserId(body.payload.user.id);
          setFeedback({ tone: "warning", title: "Replace the temporary password", message: "Choose a new password before opening FluxIQ." });
          return;
        }
        window.location.href = "/";
        return;
      }
      if (body?.requiresTotp) {
        setRequiresTotp(true);
        setFeedback({
          tone: totp ? "error" : "info",
          title: totp ? "Authenticator code rejected" : "Authenticator required",
          message: totp ? "Check the current code and try again." : "Your password was accepted. Enter the current six-digit code."
        });
      } else if (response.status === 429) {
        const seconds = Math.max(1, Math.ceil((body?.retryAfterMs ?? 60_000) / 1_000));
        setRateLimitSeconds(seconds);
        setFeedback({ tone: "error", title: "Sign-in temporarily locked", message: `Try again in ${seconds} seconds.` });
      } else {
        const remaining = typeof body?.attemptsRemaining === "number" ? ` ${body.attemptsRemaining} attempt${body.attemptsRemaining === 1 ? "" : "s"} remaining.` : "";
        setFeedback({ tone: "error", title: "Sign-in failed", message: `${body?.error ?? "Check your username and password."}${remaining}` });
      }
    } catch {
      setFeedback({ tone: "error", title: "FluxIQ is unavailable", message: "The authentication service could not be reached. Check the local runtime and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = setupPasswordError(newPassword, confirmPassword);
    if (validation || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/programs/identity-access/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: setupUserId, value: newPassword, authorizationPassword: password })
      });
      const result = await response.json().catch(() => undefined) as { ok?: boolean; error?: string } | undefined;
      if (!response.ok || !result?.ok) {
        setFeedback({ tone: "error", title: "Password could not be replaced", message: result?.error ?? "Keep this page open and try again." });
        return;
      }
      setFeedback({ tone: "success", title: "Password updated", message: "Opening FluxIQ with your secured account." });
      window.location.href = "/";
    } catch {
      setFeedback({ tone: "error", title: "Setup could not finish", message: "The identity service could not be reached. Your entries have been preserved." });
    } finally {
      setBusy(false);
    }
  }

  const passwordError = setupPasswordError(newPassword, confirmPassword);
  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" className="auth-card auth-panel-v1">
        <div className="brand-lockup">
          <span className="brand-mark"><ShieldCheck size={17} aria-hidden /></span>
          <span><strong id="auth-title">FluxIQ</strong><small>{setupUserId ? "Secure first setup" : "Sign in to continue"}</small></span>
        </div>
        {feedback ? <InlineNotice message={feedback.message} title={feedback.title} tone={feedback.tone} /> : null}
        {setupUserId ? (
          <form className="auth-form" onSubmit={completeSetup}>
            <Field hint="Use at least 12 characters and do not reuse the temporary password." label="New password" required>
              <input autoComplete="new-password" data-autofocus onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
            </Field>
            <Field {...(confirmPassword && passwordError ? { error: passwordError } : {})} label="Confirm new password" required>
              <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
            </Field>
            <Button busy={busy} disabled={Boolean(passwordError)} type="submit" variant="primary">Finish setup</Button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={login}>
            <Field label="Username" required><input autoComplete="username" autoFocus name="username" onChange={(event) => setUsername(event.target.value)} value={username} /></Field>
            <div className="field">
              <label className="field-label" htmlFor="auth-password">Password <span aria-hidden>*</span></label>
              <div className="password-input">
                <input aria-required autoComplete="current-password" id="auth-password" name="password" onKeyDown={readCapsLock} onKeyUp={readCapsLock} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} value={password} />
                <IconButton label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}</IconButton>
              </div>
            </div>
            {capsLock ? <InlineNotice message="Caps Lock is on." tone="warning" /> : null}
            {requiresTotp ? <Field hint="Your password has already been accepted." label="Authenticator code" required><input autoComplete="one-time-code" inputMode="numeric" name="totp" onChange={(event) => setTotp(digits(event.target.value, 6))} value={totp} /></Field> : null}
            <Button busy={busy} disabled={!username.trim() || !password || (requiresTotp && totp.length !== 6) || rateLimitSeconds > 0} type="submit" variant="primary">
              {rateLimitSeconds > 0 ? `Try again in ${rateLimitSeconds}s` : "Sign in"}
            </Button>
          </form>
        )}
        {setupUserId ? <div className="auth-setup-assurance"><CheckCircle2 aria-hidden size={14} /><span>Your entries stay on this device and are sent only to the local FluxIQ identity service.</span></div> : null}
      </section>
    </main>
  );
}

export function setupPasswordError(password: string, confirmation: string): string {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.toLowerCase() === "admin") return "Choose a password other than the temporary password.";
  if (password !== confirmation) return "Passwords do not match.";
  return "";
}

function digits(value: string, maxLength: number): string {
  return value.replace(/D/g, "").slice(0, maxLength);
}
