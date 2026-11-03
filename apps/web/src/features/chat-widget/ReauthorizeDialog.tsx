"use client";

// The PIN dialog for an answer with a lasting effect. The chat (plain DOM)
// hands over the words and a `submit`; this draws the panel's shared
// authorization dialog, asks for the PIN only, and keeps the dialog open with
// Core's reason when the answer is refused. The PIN lives in this component's
// state for as long as the dialog is open and is cleared once the answer went.

import { useState } from "react";
import type { ChatReauthorizeRequest } from "@fluxiq/ui-components";
import { AuthorizationDialog, type AuthorizationCredentials } from "../programs/components";

const EMPTY_CREDENTIALS: AuthorizationCredentials = { password: "", pin: "", totp: "" };

export function ReauthorizeDialog(props: { request: ChatReauthorizeRequest; onClose(): void }) {
  const { request } = props;
  const [credentials, setCredentials] = useState<AuthorizationCredentials>(EMPTY_CREDENTIALS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function authorize() {
    if (busy) return;
    setBusy(true);
    setError("");
    const outcome = await request.submit(credentials.pin).catch(() => ({ ok: false as const, error: "The answer could not be sent." }));
    if (outcome.ok) {
      setCredentials(EMPTY_CREDENTIALS);
      props.onClose();
      return;
    }
    setError(outcome.error);
    setBusy(false);
  }

  function cancel() {
    setCredentials(EMPTY_CREDENTIALS);
    request.cancel();
    props.onClose();
  }

  return (
    <AuthorizationDialog
      actionLabel={request.actionLabel}
      busy={busy}
      credentials={credentials}
      description={request.description}
      requirements={{ pin: true }}
      title={request.title}
      {...(error ? { error } : {})}
      onAuthorize={() => void authorize()}
      onCancel={cancel}
      onChange={setCredentials}
    />
  );
}
