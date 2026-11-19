"use client";

import { useState } from "react";
import type { RemoveOutcome } from "../model";

/** Removing a key is one confirm: one press of Remove key sends the one call that removes it. Nothing is asked first and nothing is asked again. */
export function RemoveKeyConfirm(props: { keyName: string; onRemove(): Promise<RemoveOutcome>; onCancel(): void }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function press() {
    if (pending) return;
    setPending(true);
    const outcome = await props.onRemove();
    setPending(false);
    if (outcome.kind === "refused") setMessage(outcome.message);
  }
  return (
    <div className="settings-remove" role="group" aria-label={`Remove ${props.keyName}`}>
      <p>Remove the key &ldquo;{props.keyName}&rdquo;? FluxIQ forgets it for good. If it was your default, the next key you have turned on takes over.</p>
      {message ? <p role="alert" className="settings-problem">{message}</p> : null}
      <div className="settings-actions">
        <button type="button" className="button danger" disabled={pending} onClick={() => void press()}>{pending ? "Removing…" : "Remove key"}</button>
        <button type="button" className="button" disabled={pending} onClick={props.onCancel}>Keep it</button>
      </div>
    </div>
  );
}
