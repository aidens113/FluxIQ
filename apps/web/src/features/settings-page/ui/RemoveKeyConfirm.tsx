"use client";

import { useState } from "react";
import type { RemoveOutcome, RemoveProof } from "../model";

/**
 * Removing a key is destructive, so it takes one press here and nothing more:
 * no PIN unless the engine says the person turned one on, and then it asks for
 * it in plain words. Your password is asked for only if the engine still wants it.
 */
export function RemoveKeyConfirm(props: { keyName: string; onRemove(proof?: RemoveProof): Promise<RemoveOutcome>; onCancel(): void }) {
  const [ask, setAsk] = useState<"nothing" | "pin" | "password">("nothing");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function press() {
    setPending(true);
    const outcome = await props.onRemove({ ...(password ? { password } : {}), ...(pin ? { pin } : {}) });
    setPending(false);
    setPassword("");
    setPin("");
    if (outcome.kind === "needs-pin") {
      setAsk("pin");
      setMessage("You turned a PIN on, so enter it to remove this key.");
    } else if (outcome.kind === "needs-password") {
      setAsk("password");
      setMessage(outcome.message);
    } else if (outcome.kind === "refused") {
      setMessage(outcome.message);
    }
  }
  return (
    <div role="group" aria-label={`Remove ${props.keyName}`} className="settings-remove">
      <p>Remove the key &ldquo;{props.keyName}&rdquo;? FluxIQ forgets it for good. If it was your default, the next key you have turned on takes over.</p>
      {ask === "pin" ? <label>Your PIN<input inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} autoComplete="off" /></label> : null}
      {ask === "password" ? <label>Your password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label> : null}
      {message ? <p role="alert">{message}</p> : null}
      <button type="button" disabled={pending || (ask === "pin" && pin.length < 4) || (ask === "password" && !password)} onClick={() => void press()}>{pending ? "Removing..." : "Remove key"}</button>
      <button type="button" disabled={pending} onClick={props.onCancel}>Keep it</button>
    </div>
  );
}
