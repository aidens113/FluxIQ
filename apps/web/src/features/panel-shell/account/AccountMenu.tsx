"use client";

import { useState } from "react";
import { signOut } from "./sign-out";

/** The top bar's account menu: who is signed in, a way to the sign-in settings, and Sign out. */
export function AccountMenu(props: { name?: string; signOutAction?: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = props.signOutAction ?? (() => signOut());
  async function leave() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const done = await end();
    if (!done) {
      setBusy(false);
      setFailed(true);
    }
  }
  return (
    <div className="panel-account">
      <button type="button" className="panel-account-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{props.name ?? "Account"}</button>
      {open ? (
        <div className="panel-account-menu" role="menu" aria-label="Account">
          <a role="menuitem" href="/security/sign-in">Your sign-in</a>
          <button type="button" role="menuitem" disabled={busy} onClick={() => void leave()}>{busy ? "Signing out…" : "Sign out"}</button>
          {failed ? <span role="alert" className="panel-account-problem">Could not sign out. Try again.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
