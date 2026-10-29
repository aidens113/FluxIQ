"use client";

import { useFragmentToken } from "../welcome/client";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { ResetRequestForm } from "./ResetRequestForm";

/** Without a link token: ask for a reset link. With one (in the fragment, cleared at once): set the new password. */
export function ResetClient() {
  const found = useFragmentToken();
  if (found.state === "reading") return null;
  if (found.state === "token") return <ResetPasswordForm token={found.token} />;
  return <>
    <p>Enter the email address of your account and we will send you a link to choose a new password.</p>
    <p className="account-link-note">Model keys saved under your old password cannot be opened after a reset. You will need to add them again.</p>
    <ResetRequestForm />
  </>;
}
