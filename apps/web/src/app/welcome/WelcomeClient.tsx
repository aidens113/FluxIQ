"use client";

import { useCallback, useEffect, useState } from "react";
import { accountLinkMessage, describeWelcomeLink, invitationSentence, PasswordForm, postAccountLink, useFragmentToken, type WelcomeLinkAnswer } from "./client";

/** One sentence for every bad welcome link (unknown, used or expired), so a probe learns nothing, and it says how to get a new one. */
const INVALID_WELCOME = "This link is invalid, already used or expired. Ask whoever invited you to send a new invite, or resend it from the site you signed up on.";

function messageOf(code: string): string {
  return code === "invalid_link" ? INVALID_WELCOME : accountLinkMessage(code);
}

type Phase = { state: "checking" } | { state: "refused"; code: string } | { state: "ready"; invitation: Extract<WelcomeLinkAnswer, { ok: true }>["invitation"] };

/**
 * Sets the password from the emailed link and signs the person in. The token
 * is read from the fragment and cleared from the address at once. Before
 * asking for a password the page says what the link is for (the workspace,
 * the role and the email to sign in with) without spending it; a used or
 * expired link says so instead of offering a form. On success the person lands
 * in the panel, signed in.
 */
export function WelcomeClient() {
  const found = useFragmentToken();
  const token = found.state === "token" ? found.token : null;
  const [phase, setPhase] = useState<Phase>({ state: "checking" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (token === null) return;
    let live = true;
    setPhase({ state: "checking" });
    void describeWelcomeLink(token).then((answer) => {
      if (!live) return;
      setPhase(answer.ok ? { state: "ready", invitation: answer.invitation } : { state: "refused", code: answer.code });
    });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  if (found.state === "reading") return null;
  if (token === null) return <p role="alert">{INVALID_WELCOME}</p>;
  if (phase.state === "checking") return <p role="status">Checking your link...</p>;
  if (phase.state === "refused") {
    return <>
      <p role="alert">{messageOf(phase.code)}</p>
      {phase.code === "unreachable" ? <button onClick={retry} type="button">Try again</button> : null}
    </>;
  }
  const linkToken = token;

  async function submit(password: string): Promise<string | null> {
    const answer = await postAccountLink("/welcome/submit", { token: linkToken, password });
    if (!answer.ok) {
      if (answer.code === "invalid_link") setPhase({ state: "refused", code: "invalid_link" });
      return messageOf(answer.code);
    }
    window.location.assign(answer.continueUrl ?? "/");
    return null;
  }

  return <>
    <p>{invitationSentence(phase.invitation, window.location.host ?? "")}</p>
    {phase.invitation.email ? <p className="account-link-note">You will sign in as {phase.invitation.email}.</p> : null}
    <p>Choose a password to finish setting up your account.</p>
    <PasswordForm busyLabel="Setting up..." onSubmit={submit} submitLabel="Set password and continue" />
  </>;
}
