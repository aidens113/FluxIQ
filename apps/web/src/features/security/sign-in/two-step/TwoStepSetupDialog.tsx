"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "../../../programs/shared-ui";
import { identityCall, type IdentityPost } from "../identity-call";

type Enrolment = { secret: string; qrSvg: string };

function enrolmentOf(value: unknown): Enrolment | null {
  if (value === null || typeof value !== "object") return null;
  const { secret, qrSvg } = value as { secret?: unknown; qrSvg?: unknown };
  return typeof secret === "string" && typeof qrSvg === "string" ? { secret, qrSvg } : null;
}

/**
 * Turns on two-step sign-in in two steps: the person's password, then the
 * code their authenticator app shows after they scan the picture (or type the
 * key). Done when the code is accepted.
 */
export function TwoStepSetupDialog(props: { userId: string; post: IdentityPost; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [held, setHeld] = useState("");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setProblem("");
    const result = await identityCall(props.post, "begin-totp", { userId: props.userId, authorizationPassword: password, authorizationPin: "", authorizationTotp: "" });
    setBusy(false);
    const next = result.ok ? enrolmentOf(result.payload) : null;
    if (next === null) return setProblem(result.ok ? "That did not work. Try again." : result.error || "That did not work. Check your password and try again.");
    setHeld(password);
    setPassword("");
    setEnrolment(next);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setProblem("");
    const result = await identityCall(props.post, "confirm-totp", { userId: props.userId, code, authorizationPassword: held, authorizationPin: "", authorizationTotp: "" });
    setBusy(false);
    if (result.ok) {
      setHeld("");
      props.onDone();
    } else setProblem(result.error || "That code was not accepted. Check the app and try again.");
  }

  return (
    <Modal title="Set up two-step sign-in" description="You will type a code from an authenticator app each time you sign in." onClose={props.onClose}>
      {enrolment === null ? (
        <form className="dialog-form" onSubmit={(event) => void start(event)}>
          <label className="field"><span className="field-label">Your password</span><input autoComplete="current-password" data-autofocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {problem ? <p className="security-error" role="alert">{problem}</p> : null}
          <div className="modal-actions"><button className="button" type="button" onClick={props.onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || !password}>Continue</button></div>
        </form>
      ) : (
        <form className="dialog-form" onSubmit={(event) => void confirm(event)}>
          <p>Scan this picture with your authenticator app, or type its key into the app.</p>
          <div className="totp-qr-frame" dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }} />
          <p><strong>Key</strong> <code>{enrolment.secret}</code></p>
          <label className="field"><span className="field-label">Six-digit code from the app</span><input autoComplete="one-time-code" data-autofocus inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} /></label>
          {problem ? <p className="security-error" role="alert">{problem}</p> : null}
          <div className="modal-actions"><button className="button" type="button" onClick={props.onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || code.length !== 6}>Turn on</button></div>
        </form>
      )}
    </Modal>
  );
}
