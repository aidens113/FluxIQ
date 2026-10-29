"use client";

import { useState } from "react";
import { accountLinkMessage, PasswordForm, postAccountLink } from "../welcome/client";

/** Sets the new password for a reset link, then points to sign-in. */
export function ResetPasswordForm(props: { token: string }) {
  const [done, setDone] = useState(false);

  async function submit(password: string): Promise<string | null> {
    const answer = await postAccountLink("/reset/submit", { token: props.token, password });
    if (!answer.ok) return accountLinkMessage(answer.code);
    setDone(true);
    return null;
  }

  if (done) return <p role="status">Your password is changed. <a href="/">Sign in</a> with it.</p>;
  return <>
    <p>Choose a new password.</p>
    <p className="account-link-note">Model keys saved under your old password cannot be opened after a reset. You will need to add them again.</p>
    <PasswordForm busyLabel="Saving..." onSubmit={submit} submitLabel="Change password" />
  </>;
}
