"use client";

import { useEffect, useState, type FormEvent } from "react";
import { replacementPasswordError } from "../api/auth/credential-setup-rules";
import { localSetupMessage, postSetup, takeSetupCodeFromLink } from "./client";

type Field = "code" | "username" | "password" | "confirmation";

const EMPTY: Record<Field, string> = { code: "", username: "", password: "", confirmation: "" };

/**
 * First-time setup on a local FluxIQ, opened from the link printed where it
 * started: the person chooses the name they sign in with and a password, and
 * is signed in. The code comes from the link and is never shown; a field for
 * it appears only when the link carried none.
 */
export function LocalSetupClient() {
  const [values, setValues] = useState(EMPTY);
  // null until the link has been read, then whether it carried a code.
  const [linkCode, setLinkCode] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);

  useEffect(() => {
    const code = takeSetupCodeFromLink(window);
    setValues((current) => ({ ...current, code }));
    setLinkCode(code !== "");
  }, []);

  function field(name: Field, label: string, type: string, autoComplete: string) {
    return <label>{label}<input aria-invalid={invalid.includes(name) || undefined} autoComplete={autoComplete} name={name} onChange={(event) => setValues({ ...values, [name]: event.target.value })} required type={type} value={values[name]} /></label>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = replacementPasswordError(values.password, values.confirmation);
    if (problem !== "") {
      setMessage(problem);
      setInvalid(["password", "confirmation"]);
      return;
    }
    setBusy(true);
    setMessage(null);
    const answer = await postSetup({ code: values.code, username: values.username.trim(), password: values.password, confirmation: values.confirmation });
    if (answer.ok) {
      window.location.assign(answer.redirectTo);
      return;
    }
    setInvalid(answer.fields);
    setMessage(localSetupMessage(answer.code, answer.retryAfterMs));
    setBusy(false);
  }

  return <>
    <p>Choose the name and password you will sign in with. This account owns FluxIQ on this computer.</p>
    <form className="account-link-form" onSubmit={(event) => void submit(event)}>
      {linkCode === false ? field("code", "Setup code (from the link printed where FluxIQ started)", "password", "off") : null}
      {field("username", "Your name (you sign in with it)", "text", "username")}
      {field("password", "Password", "password", "new-password")}
      {field("confirmation", "Confirm password", "password", "new-password")}
      <p className="account-link-hint">At least 12 characters.</p>
      {message !== null ? <p className="account-link-message" role="alert">{message}</p> : null}
      <button disabled={busy || linkCode === null} type="submit">{busy ? "Setting up..." : "Set up and sign in"}</button>
    </form>
  </>;
}
