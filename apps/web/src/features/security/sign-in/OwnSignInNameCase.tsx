"use client";

import { CaseSensitive } from "lucide-react";
import { useState } from "react";
import { Field, Modal, VisualAlert } from "../../programs/shared-ui";

/**
 * The person's own control, in "Your sign-in", for the capitals of their
 * sign-in name: `identity-access/recase-my-username`, which any signed-in
 * person may call for their own name and which takes only that name in other
 * capitals. A different name is not offered here (an administrator renames a
 * person, and an account holder's name is their account email), so Save waits
 * for a name equal to the current one ignoring case, and the endpoint decides
 * again. `save` answers "" when saved, the refusal to show otherwise, or null
 * when the page moved on and nothing should change.
 */
export function OwnSignInNameCase({ username, busy, save }: { username: string; busy: boolean; save(next: string): Promise<string | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [refusal, setRefusal] = useState("");
  const close = () => {
    setDraft(null);
    setRefusal("");
  };
  const sameName = draft !== null && draft.toLowerCase() === username.toLowerCase();
  const changed = draft !== null && draft !== username;
  async function submit() {
    if (draft === null || !sameName || !changed) return;
    const answer = await save(draft);
    if (typeof answer !== "string") return;
    if (answer === "") close();
    else setRefusal(answer);
  }
  return <>
    <button className="button" disabled={busy} onClick={() => {
      setRefusal("");
      setDraft(username);
    }} type="button"><CaseSensitive size={14} aria-hidden />Change capitals in your sign-in name</button>
    {draft !== null ? <Modal title="Capitals in your sign-in name" description="Only which letters are capitals can change here. You keep the same sign-in name, and you can still sign in with it typed in any case." onClose={close}>
      {refusal ? <VisualAlert tone="error" title="Your sign-in name was not changed" message={refusal} /> : null}
      <div className="dialog-form"><Field hint={sameName ? "Change only which letters are capitals." : "That is a different name. Only the capitals of " + username + " can change here."} label="Sign-in name" required><input autoComplete="username" data-autofocus value={draft} onChange={(event) => {
        setRefusal("");
        setDraft(event.target.value);
      }} /></Field></div>
      <div className="modal-actions"><button className="button" onClick={close} type="button">Cancel</button><button className="button button-primary" disabled={busy || !sameName || !changed} onClick={() => void submit()} type="button">Save sign-in name</button></div>
    </Modal> : null}
  </>;
}
