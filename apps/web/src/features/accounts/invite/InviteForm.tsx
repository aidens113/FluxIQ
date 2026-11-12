"use client";

import { useState, type FormEvent } from "react";
import { ACCOUNT_ROLES, type AccountsOutcome, type AssignableRole, type CredentialProof, type InviteRequest } from "../model";
import { ProofForm } from "../proof";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Invites a person by email with a role. The administrator fills in who and
 * what role, then confirms with their own credentials; the person gets an
 * email with a one-time welcome link (24 hours) to set their password. The
 * link is never shown here.
 */
export function InviteForm(props: { roles: AssignableRole[]; onInvite: (invite: InviteRequest, proof: CredentialProof) => Promise<AccountsOutcome>; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AssignableRole | undefined>(props.roles.find((candidate) => candidate === "read-only") ?? props.roles[0]);
  const [confirming, setConfirming] = useState<InviteRequest | null>(null);
  const [problem, setProblem] = useState<string>();
  const [sent, setSent] = useState<string>();

  if (role === undefined) return null;

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(undefined);
    const address = email.trim();
    const name = displayName.trim();
    if (!EMAIL_SHAPE.test(address)) return setProblem("Type the email address the invite goes to.");
    if (!name) return setProblem("Type the person's name.");
    if (role === undefined) return setProblem("Choose a role.");
    setProblem(undefined);
    setConfirming({ email: address, displayName: name, role });
  }

  if (confirming !== null) {
    const label = ACCOUNT_ROLES[confirming.role].label;
    return (
      <ProofForm
        question={`Invite ${confirming.displayName} (${confirming.email}) as ${label.toLowerCase()}? ${ACCOUNT_ROLES[confirming.role].summary}`}
        confirmLabel="Send invite"
        onConfirm={(proof) => props.onInvite(confirming, proof)}
        onDone={() => {
          setSent(`Invite sent to ${confirming.email}. The link in it works once, for 24 hours.`);
          setConfirming(null);
          setEmail("");
          setDisplayName("");
          props.onDone();
        }}
        onCancel={() => setConfirming(null)}
      />
    );
  }

  return (
    <form className="accounts-invite-form" aria-label="Invite someone" onSubmit={review}>
      <label className="accounts-field">Email<input autoComplete="off" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="accounts-field">Name<input autoComplete="off" type="text" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label className="accounts-field">Role
        <select value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>
          {props.roles.map((candidate) => <option key={candidate} value={candidate}>{ACCOUNT_ROLES[candidate].label}</option>)}
        </select>
      </label>
      <p className="accounts-muted">{ACCOUNT_ROLES[role].summary}</p>
      {problem ? <p className="accounts-problem" role="alert">{problem}</p> : null}
      {sent ? <p className="accounts-sent" role="status">{sent}</p> : null}
      <span className="accounts-buttons"><button type="submit" className="accounts-button accounts-primary">Invite</button></span>
    </form>
  );
}
