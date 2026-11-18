"use client";

import { useState, type FormEvent } from "react";
import type { RemoveOutcome } from "../model";

/**
 * Removing a key is one confirm: the password is asked in this same box and sent with the one call that removes
 * the key. Nothing is asked first and nothing is asked again.
 */
export function RemoveKeyConfirm(props: { keyName: string; onRemove(password: string): Promise<RemoveOutcome>; onCancel(): void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function press() {
    const sent = password;
    setPending(true);
    setPassword("");
    const outcome = await props.onRemove(sent);
    setPending(false);
    if (outcome.kind === "refused") setMessage(outcome.message);
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password && !pending) void press();
  }
  return (
    <form className="settings-remove" aria-label={`Remove ${props.keyName}`} onSubmit={onSubmit}>
      <p>Remove the key &ldquo;{props.keyName}&rdquo;? FluxIQ forgets it for good. If it was your default, the next key you have turned on takes over.</p>
      <label className="field"><span className="field-label">Your password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
      {message ? <p role="alert" className="settings-problem">{message}</p> : null}
      <div className="settings-actions">
        <button type="submit" className="button danger" disabled={pending || !password}>{pending ? "Removing…" : "Remove key"}</button>
        <button type="button" className="button" disabled={pending} onClick={props.onCancel}>Keep it</button>
      </div>
    </form>
  );
}
