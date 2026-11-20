"use client";

import { useState } from "react";
import { signOut } from "../../panel-shell";

/** Signs this browser out and goes to the sign-in page; says so when the server did not end the session. */
export function SignOutButton(props: { signOutAction?: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function leave() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const done = await (props.signOutAction ?? (() => signOut()))();
    if (!done) {
      setBusy(false);
      setFailed(true);
    }
  }
  return (
    <span className="security-action">
      <button className="button" disabled={busy} onClick={() => void leave()} type="button">{busy ? "Signing out…" : "Sign out"}</button>
      {failed ? <span className="security-error" role="alert">Could not sign out. Try again.</span> : null}
    </span>
  );
}
