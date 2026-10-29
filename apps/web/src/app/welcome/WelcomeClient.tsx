"use client";

import { accountLinkMessage, PasswordForm, postAccountLink, useFragmentToken } from "./client";

/** Sets the password from the emailed link and signs the person in. The token is read from the fragment and cleared from the address at once. */
export function WelcomeClient() {
  const found = useFragmentToken();
  if (found.state === "reading") return null;
  if (found.state === "none") return <p role="alert">{accountLinkMessage("invalid_link")}</p>;
  const { token } = found;

  async function submit(password: string): Promise<string | null> {
    const answer = await postAccountLink("/welcome/submit", { token, password });
    if (!answer.ok) return accountLinkMessage(answer.code);
    window.location.assign(answer.continueUrl ?? "/");
    return null;
  }

  return <>
    <p>Choose a password to finish setting up your account.</p>
    <PasswordForm busyLabel="Setting up..." onSubmit={submit} submitLabel="Set password and continue" />
  </>;
}
