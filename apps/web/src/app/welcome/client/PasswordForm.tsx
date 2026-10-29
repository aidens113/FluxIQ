"use client";

import { useState, type FormEvent } from "react";
import { passwordProblem } from "./passwordProblem";

export type PasswordFormProps = {
  submitLabel: string;
  busyLabel: string;
  /** Sends the password; returns a message to show, or null when it succeeded. */
  onSubmit(password: string): Promise<string | null>;
};

/** A new-password field with its confirmation. The password stays in this component and is posted, never stored. */
export function PasswordForm(props: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = passwordProblem(password, confirmation);
    if (problem !== null) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(null);
    setMessage(await props.onSubmit(password));
    setBusy(false);
  }

  return <form className="account-link-form" onSubmit={(event) => void submit(event)}>
    <label>New password<input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
    <label>Confirm password<input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
    <p className="account-link-hint">At least 12 characters.</p>
    {message !== null ? <p className="account-link-message" role="alert">{message}</p> : null}
    <button disabled={busy} type="submit">{busy ? props.busyLabel : props.submitLabel}</button>
  </form>;
}
