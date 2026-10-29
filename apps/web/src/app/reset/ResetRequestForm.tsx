"use client";

import { useState, type FormEvent } from "react";
import { postAccountLink } from "../welcome/client";

/** The email form: the same sentence is shown whether or not the address has an account. */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const answer = await postAccountLink("/reset/request", { email: email.trim() });
    setSent(answer.ok);
    setFailed(!answer.ok);
    setBusy(false);
  }

  if (sent) return <p role="status">If an account uses that address, we sent a link. It works for one hour.</p>;
  return <form className="account-link-form" onSubmit={(event) => void submit(event)}>
    <label>Email<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
    {failed ? <p className="account-link-message" role="alert">That did not work. Try again.</p> : null}
    <button disabled={busy} type="submit">{busy ? "Sending..." : "Send reset link"}</button>
  </form>;
}
