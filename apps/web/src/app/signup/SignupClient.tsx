"use client";

import { useState, type FormEvent } from "react";
import { postAccountLink } from "../welcome/client";
import { signupMessage } from "./client";
import "./signup.css";

/**
 * The sign-up form: email, display name and the terms. Accepting sends the
 * terms version shown. Every accepted sign-up shows the same sentence, so
 * the page never says whether the address already has an account.
 */
export function SignupClient(props: { termsVersion: string }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !accepted) return;
    setBusy(true);
    setMessage(null);
    const answer = await postAccountLink("/signup/submit", { email: email.trim(), displayName: displayName.trim(), termsVersion: props.termsVersion });
    if (answer.ok) setSent(true);
    else setMessage(signupMessage(answer.code));
    setBusy(false);
  }

  if (sent) return <p role="status">Check your email. We sent a link to finish setting up your account; it works for 24 hours. If the address already has an account, the email says how to sign in.</p>;
  return <>
    <p>Create an account with your own workspace. We will email you a link to choose your password.</p>
    <form className="account-link-form" onSubmit={(event) => void submit(event)}>
      <label>Email address<input autoComplete="email" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
      <label>Display name<input autoComplete="name" maxLength={100} name="displayName" onChange={(event) => setDisplayName(event.target.value)} required type="text" value={displayName} /></label>
      <label className="signup-terms"><input checked={accepted} name="terms" onChange={(event) => setAccepted(event.target.checked)} required type="checkbox" /><span>I accept the FluxIQ terms of service (version {props.termsVersion}).</span></label>
      {message !== null ? <p className="account-link-message" role="alert">{message}</p> : null}
      <button disabled={busy || !accepted} type="submit">{busy ? "Signing up..." : "Sign up"}</button>
    </form>
    <p className="account-link-note">Already have an account? <a href="/">Sign in</a></p>
  </>;
}
