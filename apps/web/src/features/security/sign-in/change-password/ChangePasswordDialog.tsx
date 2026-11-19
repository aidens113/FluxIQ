"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "../../../programs/shared-ui";
import { identityCall, type IdentityPost } from "../identity-call";
import { passwordMismatch } from "./passwords-match";

/**
 * Changes the signed-in person's own password. Labelled Current password, New
 * password and Repeat new password; a mismatch is said inline, and success
 * closes the dialog through `onChanged`. The authenticator code is asked only
 * when the person has two-step sign-in on. Nothing typed is kept after it is sent.
 */
export function ChangePasswordDialog(props: { userId: string; twoStep: boolean; post: IdentityPost; onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const mismatch = passwordMismatch(next, repeat);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next !== repeat) return setProblem("The new passwords do not match.");
    if (!current || !next) return setProblem("Fill in all three password boxes.");
    setBusy(true);
    setProblem("");
    const result = await identityCall(props.post, "set-password", { userId: props.userId, value: next, authorizationPassword: current, authorizationPin: "", authorizationTotp: code });
    setBusy(false);
    setCurrent("");
    setNext("");
    setRepeat("");
    setCode("");
    if (result.ok) props.onChanged();
    else setProblem(result.error || "That did not work. Check your current password and try again.");
  }

  const shown = mismatch ?? problem;
  return (
    <Modal title="Change password" onClose={props.onClose}>
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <label className="field"><span className="field-label">Current password</span><input autoComplete="current-password" data-autofocus required type="password" value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
        <label className="field"><span className="field-label">New password</span><input autoComplete="new-password" required type="password" value={next} onChange={(event) => setNext(event.target.value)} /></label>
        <label className="field"><span className="field-label">Repeat new password</span><input autoComplete="new-password" required type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} /></label>
        {props.twoStep ? <label className="field"><span className="field-label">Code from your authenticator app</span><input autoComplete="one-time-code" inputMode="numeric" required type="text" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} /></label> : null}
        {shown ? <p className="security-error" role="alert">{shown}</p> : null}
        <div className="modal-actions">
          <button className="button" type="button" onClick={props.onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={busy || mismatch !== null}>{busy ? "Saving…" : "Change password"}</button>
        </div>
      </form>
    </Modal>
  );
}
