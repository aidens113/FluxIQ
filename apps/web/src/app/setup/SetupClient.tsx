"use client";

import { useState, type FormEvent } from "react";
import { passwordProblem } from "../welcome/client";
import { postSetup, setupMessage } from "./client";

type Field = "code" | "username" | "displayName" | "password" | "confirmation";

const EMPTY: Record<Field, string> = { code: "", username: "", displayName: "", password: "", confirmation: "" };

/** The owner claim form: the setup code, the owner's email and name, and a password. Nothing typed is stored; it is posted once. */
export function SetupClient() {
  const [values, setValues] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);

  function field(name: Field, label: string, type: string, autoComplete: string) {
    return <label>{label}<input aria-invalid={invalid.includes(name) || undefined} autoComplete={autoComplete} name={name} onChange={(event) => setValues({ ...values, [name]: event.target.value })} required type={type} value={values[name]} /></label>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = passwordProblem(values.password, values.confirmation);
    if (problem !== null) {
      setMessage(problem);
      setInvalid(["password", "confirmation"]);
      return;
    }
    setBusy(true);
    setMessage(null);
    const answer = await postSetup(values);
    if (answer.ok) {
      window.location.assign(answer.redirectTo);
      return;
    }
    setInvalid(answer.fields);
    setMessage(setupMessage(answer.code, answer.retryAfterMs));
    setBusy(false);
  }

  return <>
    <p>Enter the setup code from the file named in the server&apos;s start-up log, then create the owner account. The owner administers this server, and the default admin account stops working.</p>
    <form className="account-link-form" onSubmit={(event) => void submit(event)}>
      {field("code", "Setup code", "password", "off")}
      {field("username", "Email address (your username)", "email", "username")}
      {field("displayName", "Display name", "text", "name")}
      {field("password", "Password", "password", "new-password")}
      {field("confirmation", "Confirm password", "password", "new-password")}
      <p className="account-link-hint">At least 12 characters.</p>
      {message !== null ? <p className="account-link-message" role="alert">{message}</p> : null}
      <button disabled={busy} type="submit">{busy ? "Setting up..." : "Create owner and sign in"}</button>
    </form>
  </>;
}
