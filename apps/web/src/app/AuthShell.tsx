"use client";

import { Blocks, CheckCircle2, Eye, EyeOff, KeyRound, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Breadcrumb, Button, Field, IconButton, InlineNotice, Menu, type AlertTone, type BreadcrumbItem } from "../features/programs/shared-ui";
import { sanitizeAsciiDigits } from "../lib/input-sanitizers";
import { CREDENTIAL_SETUP_PENDING_COOKIE, replacementPasswordError } from "./api/auth/credential-setup-rules";
import { signedOutPath } from "../features/panel-shell/account";
import { localAuthDestination } from "./auth-navigation";
import { BrandMark, LoginProductLinks, usePanelBranding } from "./product/client";

export function AuthStatus(props: { displayName: string; roleId: string }) {
  const mounted = useRef(false);
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; pending.current = null; };
  }, []);

  async function logout() {
    if (!mounted.current || pending.current !== null) return;
    const request = ++generation.current;
    pending.current = request;
    setBusy(true);
    setFailed(false);
    const isCurrent = () => mounted.current && generation.current === request;
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!isCurrent()) return;
      // Stay on this page: the signed-out panel shows sign-in here, and signing in again returns to it.
      if (response.ok) window.location.href = signedOutPath(window.location);
      else setFailed(true);
    } catch {
      if (isCurrent()) setFailed(true);
    } finally {
      if (isCurrent()) { pending.current = null; setBusy(false); }
    }
  }

  return <div className="auth-status"><Menu icon={<UserRound aria-hidden size={15} />} label={props.displayName} options={[
    { id: "account", label: "Account and access", href: "/security/sign-in", icon: <Settings aria-hidden size={14} /> },
    { id: "logout", label: busy ? "Signing out..." : "Log out", disabled: busy, onSelect: () => void logout(), icon: <LogOut aria-hidden size={14} /> }
  ]} /><span className="auth-role">{props.roleId}</span>
    {busy ? <span role="status">Signing out...</span> : null}
    {failed ? <span role="alert">Sign-out failed. <button className="link-button" onClick={() => void logout()} type="button">Retry sign out</button></span> : null}
  </div>;
}

export function GlobalTopbar(props: {
  user: { displayName: string; roleId: string };
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
}) {
  const { name } = usePanelBranding();
  return (
    <header className="directory-topbar global-topbar">
      <Link aria-label={`${name} programs`} className="brand-lockup" href="/"><BrandMark icon={<Blocks aria-hidden size={17} />} /><span>{name}</span></Link>
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

/** Codes from `/api/auth/credential-setup` that end setup in this browser: the person signs in again. */
const SETUP_ENDED = new Set(["setup_expired", "already_replaced"]);

export function LoginPanel() {
  const branding = usePanelBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  // The temporary credential was proved and not yet replaced: only the setup form, or signing out, is offered.
  const [setupPending, setSetupPending] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // The browser extension opens FluxIQ with `?pairing=1` while its connect request waits for approval.
  const [pairingWaits, setPairingWaits] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: AlertTone; title: string; message: string } | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const destination = useRef<{ scope: string; path: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    setPairingWaits(new URLSearchParams(window.location.search).get(PAIRING_WAITS_PARAM) === "1");
    destination.current = { scope: currentLoginScope(), path: localAuthDestination(window.location.pathname + window.location.search + window.location.hash, window.location.origin) };
    // A reload, or another page, during first setup returns here: stay on the setup form.
    if (credentialSetupPending()) {
      setSetupPending(true);
      setFeedback(REPLACE_TEMPORARY);
    }
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  function beginRequest() {
    if (!mounted.current || pending.current) return null;
    const scope = currentLoginScope();
    if (destination.current?.scope !== scope) destination.current = { scope, path: localAuthDestination(window.location.pathname + window.location.search + window.location.hash, window.location.origin) };
    pending.current = true;
    const request = ++generation.current;
    return {
      path: destination.current.path,
      isCurrent: () => mounted.current && generation.current === request && scope === currentLoginScope(),
      finish: () => {
        // Completing the request can release its own busy state after a route
        // change; response content and navigation still require the old scope.
        if (mounted.current && generation.current === request) { pending.current = false; setBusy(false); }
      }
    };
  }

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
    const request = beginRequest();
    if (!request) return;
    const { isCurrent } = request;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, ...(totp ? { totp } : {}) })
      });
      const body = await response.json().catch(() => undefined) as {
        error?: string;
        requiresTotp?: boolean;
        attemptsRemaining?: number;
        retryAfterMs?: number;
        payload?: LoginPayload;
      } | undefined;
      if (!isCurrent()) return;
      if (response.ok) {
        if (body?.payload?.requiresCredentialSetup) {
          setSetupPending(true);
          setPassword("");
          setFeedback(REPLACE_TEMPORARY);
          return;
        }
        window.location.href = request.path;
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
        setFeedback({ tone: "error", title: "Sign-in failed", message: signInFailureMessage(body?.error, body?.attemptsRemaining) });
      }
    } catch {
      if (!isCurrent()) return;
      setFeedback({ tone: "error", title: "FluxIQ is unavailable", message: "The authentication service could not be reached. Check the local runtime and try again." });
    } finally {
      request.finish();
    }
  }

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = setupPasswordError(newPassword, confirmPassword);
    if (validation || busy) return;
    const request = beginRequest();
    if (!request) return;
    const { isCurrent } = request;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/credential-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: newPassword, confirmation: confirmPassword })
      });
      const result = await response.json().catch(() => undefined) as { ok?: boolean; code?: string; error?: string } | undefined;
      if (!isCurrent()) return;
      if (result?.code && SETUP_ENDED.has(result.code)) {
        endSetup();
        setFeedback({ tone: "warning", title: "Sign in again", message: result.error ?? "Sign in to continue." });
        return;
      }
      if (!response.ok || !result?.ok) {
        setFeedback({ tone: "error", title: "Password could not be replaced", message: result?.error ?? "Keep this page open and try again." });
        return;
      }
      setFeedback({ tone: "success", title: "Password updated", message: "Opening FluxIQ with your secured account." });
      window.location.href = request.path;
    } catch {
      if (!isCurrent()) return;
      setFeedback({ tone: "error", title: "Setup could not finish", message: "The identity service could not be reached. Your entries have been preserved." });
    } finally {
      request.finish();
    }
  }

  function endSetup() {
    setSetupPending(false);
    setNewPassword("");
    setConfirmPassword("");
  }

  async function leaveSetup() {
    const request = beginRequest();
    if (!request) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      if (!request.isCurrent()) return;
      endSetup();
      setFeedback(null);
    } catch {
      if (request.isCurrent()) setFeedback({ tone: "error", title: "Sign-out failed", message: "FluxIQ could not be reached. Try again." });
    } finally {
      request.finish();
    }
  }

  const passwordError = setupPasswordError(newPassword, confirmPassword);
  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" className="auth-card auth-panel-v1">
        <div className="brand-lockup">
          <BrandMark icon={<ShieldCheck size={17} aria-hidden />} />
          <span><strong id="auth-title">{branding.signInTitle ?? branding.name}</strong><small>{setupPending ? "Secure first setup" : branding.signInMessage ?? "Sign in to continue"}</small></span>
        </div>
        {!setupPending && pairingWaits ? <InlineNotice message="Sign in to approve the browser that is asking to connect." tone="info" /> : null}
        {feedback ? <InlineNotice message={feedback.message} title={feedback.title} tone={feedback.tone} /> : null}
        {setupPending ? (
          <form className="auth-form" onSubmit={completeSetup}>
            <Field hint="Use at least 12 characters and do not reuse the temporary password." label="New password" required>
              <input autoComplete="new-password" data-autofocus onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
            </Field>
            <Field {...(confirmPassword && passwordError ? { error: passwordError } : {})} label="Confirm new password" required>
              <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
            </Field>
            <Button busy={busy} disabled={Boolean(passwordError)} type="submit" variant="primary">Finish setup</Button>
            <Button disabled={busy} onClick={() => void leaveSetup()} type="button" variant="ghost"><LogOut aria-hidden size={14} /> Sign out</Button>
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
        <LoginProductLinks signUp={!setupPending} />
        {setupPending
          ? <div className="auth-setup-assurance"><CheckCircle2 aria-hidden size={14} /><span>Your entries stay on this device and are sent only to the local FluxIQ identity service.</span></div>
          : <div className="auth-setup-assurance"><KeyRound aria-hidden size={14} /><span>First time here? Open the setup link FluxIQ printed where you started it, and choose your password there. Already set up? Sign in with your username and password above.</span></div>}
      </section>
    </main>
  );
}

/** The query flag the browser extension adds to the address it opens while its connect request waits for approval. */
export const PAIRING_WAITS_PARAM = "pairing";

/** A failed sign-in in two plain sentences: what went wrong, then how many tries remain before the lock. */
export function signInFailureMessage(error: string | undefined, attemptsRemaining: number | undefined): string {
  const reason = (error?.trim() || "Check your username and password").replace(/[.!?]+$/u, "") + ".";
  if (typeof attemptsRemaining !== "number") return reason;
  const tries = attemptsRemaining <= 0 ? "No tries are left before sign-in locks for a while." : `${attemptsRemaining} ${attemptsRemaining === 1 ? "try is" : "tries are"} left before sign-in locks for a while.`;
  return `${reason} ${tries}`;
}

const REPLACE_TEMPORARY = { tone: "warning" as const, title: "Replace the temporary password", message: "Choose your own password to open FluxIQ. Nothing else opens until you do." };

/** The replacement password's rule; the setup route applies the same one. */
export function setupPasswordError(password: string, confirmation: string): string {
  return replacementPasswordError(password, confirmation);
}

/** Whether this browser is in first setup: the server sets the marker beside its HttpOnly setup cookie. The marker grants nothing. */
function credentialSetupPending(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim() === `${CREDENTIAL_SETUP_PENDING_COOKIE}=1`);
}

function digits(value: string, maxLength: number): string {
  return sanitizeAsciiDigits(value, maxLength);
}

function currentLoginScope(): string {
  return window.location.origin + window.location.pathname + window.location.search + window.location.hash;
}
