"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, InlineNotice, Modal } from "../../features/programs/shared-ui";
import { hasPendingProgramAuthentication, programAuthenticationRequiredEvent, resolveProgramAuthentication } from "../../features/programs/program-auth-recovery";
import { sanitizeAsciiDigits } from "../../lib/input-sanitizers";

export function SessionReauthentication() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const show = () => {
      setError("");
      setPassword("");
      setTotp("");
      setRequiresTotp(false);
      setOpen(true);
    };
    window.addEventListener(programAuthenticationRequiredEvent, show);
    if (hasPendingProgramAuthentication()) show();
    return () => {
      mounted.current = false;
      window.removeEventListener(programAuthenticationRequiredEvent, show);
      resolveProgramAuthentication(false);
    };
  }, []);

  function close(authenticated = false) {
    if (busy) return;
    setOpen(false);
    resolveProgramAuthentication(authenticated);
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, ...(totp ? { totp } : {}) })
      });
      const body = await response.json() as { error?: string; requiresTotp?: boolean } | undefined;
      if (!mounted.current) return;
      if (response.ok) {
        setOpen(false);
        resolveProgramAuthentication(true);
        return;
      }
      if (body?.requiresTotp) setRequiresTotp(true);
      setError(body?.error ?? "The session could not be restored.");
    } catch (error) {
      if (!mounted.current) return;
      setError(error instanceof SyntaxError
        ? "The authentication response could not be read. Your work remains open."
        : "The authentication service could not be reached. Your work remains open.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal
      busy={busy}
      closeOnEscape={!busy}
      description="Your session expired. Sign in again to retry the interrupted request without leaving this workspace."
      onClose={() => close(false)}
      title="Restore session"
    >
      <form className="dialog-form" onSubmit={authenticate}>
        {error ? <InlineNotice message={error} title="Session not restored" tone="error" /> : null}
        <Field label="Username" required><input autoComplete="username" data-autofocus onChange={(event) => setUsername(event.target.value)} value={username} /></Field>
        <Field label="Password" required><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></Field>
        {requiresTotp ? <Field label="Authenticator code" required><input autoComplete="one-time-code" inputMode="numeric" onChange={(event) => setTotp(sanitizeAsciiDigits(event.target.value, 6))} value={totp} /></Field> : null}
        <div className="modal-actions">
          <Button disabled={busy} onClick={() => close(false)} type="button">Keep work open</Button>
          <Button busy={busy} disabled={!username.trim() || !password || (requiresTotp && totp.length !== 6)} type="submit" variant="primary">Restore session</Button>
        </div>
      </form>
    </Modal>
  );
}
