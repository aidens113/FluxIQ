"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "../../../programs/shared-ui";
import { identityCall, type IdentityPost } from "../identity-call";

/** Turns two-step sign-in off, after the person's password and a current code from their authenticator app. */
export function TwoStepOffDialog(props: { userId: string; post: IdentityPost; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !password || code.length !== 6) return;
    setBusy(true);
    setProblem("");
    const result = await identityCall(props.post, "disable-totp", { userId: props.userId, authorizationPassword: password, authorizationPin: "", authorizationTotp: code });
    setBusy(false);
    setPassword("");
    setCode("");
    if (result.ok) props.onDone();
    else setProblem(result.error || "That did not work. Check your password and code, then try again.");
  }

  return (
    <Modal title="Turn off two-step sign-in" description="After this, your password alone signs you in." onClose={props.onClose}>
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <label className="field"><span className="field-label">Your password</span><input autoComplete="current-password" data-autofocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="field"><span className="field-label">Code from your authenticator app</span><input autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} /></label>
        {problem ? <p className="security-error" role="alert">{problem}</p> : null}
        <div className="modal-actions"><button className="button" type="button" onClick={props.onClose}>Cancel</button><button className="button button-danger" type="submit" disabled={busy || !password || code.length !== 6}>Turn off</button></div>
      </form>
    </Modal>
  );
}
