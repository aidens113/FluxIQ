"use client";

import { useState, type FormEvent } from "react";
import { ACCOUNT_ROLES, type AccountsOutcome, type AssignableRole, type CredentialProof, type InviteRequest } from "../model";
import { ProofForm } from "../proof";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type Created = { email: string; link: string | undefined };

/**
 * Invites a person by email with a role. The administrator fills in who and
 * what role, then confirms with their own password (and authenticator code
 * when they use one). "Invite created" says no more than is true: when the
 * answer carries the invite link it is offered to copy; otherwise the invite
 * is listed under Invites and nothing is claimed about email.
 */
export function InviteForm(props: { roles: AssignableRole[]; onInvite: (invite: InviteRequest, proof: CredentialProof) => Promise<AccountsOutcome>; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AssignableRole | undefined>(props.roles.find((candidate) => candidate === "read-only") ?? props.roles[0]);
  const [confirming, setConfirming] = useState<InviteRequest | null>(null);
  const [problem, setProblem] = useState<string>();
  const [created, setCreated] = useState<Created>();
  const [copied, setCopied] = useState<"" | "yes" | "no">("");

  if (role === undefined) return null;

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreated(undefined);
    const address = email.trim();
    const name = displayName.trim();
    if (!EMAIL_SHAPE.test(address)) return setProblem("Type the email address the invite goes to.");
    if (!name) return setProblem("Type the person's name.");
    if (role === undefined) return setProblem("Choose a role.");
    setProblem(undefined);
    setConfirming({ email: address, displayName: name, role });
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  }

  if (confirming !== null) {
    const label = ACCOUNT_ROLES[confirming.role].label;
    return (
      <ProofForm
        question={`Invite ${confirming.displayName} (${confirming.email}) as ${label.toLowerCase()}? ${ACCOUNT_ROLES[confirming.role].summary}`}
        confirmLabel="Create invite"
        onConfirm={(proof) => props.onInvite(confirming, proof)}
        onDone={(outcome) => {
          setCreated({ email: confirming.email, link: outcome.kind === "done" ? outcome.link : undefined });
          setCopied("");
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
      <label className="field"><span className="field-label">Email</span><input autoComplete="off" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field"><span className="field-label">Name</span><input autoComplete="off" type="text" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label className="field"><span className="field-label">Role</span>
        <select value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>
          {props.roles.map((candidate) => <option key={candidate} value={candidate}>{ACCOUNT_ROLES[candidate].label}</option>)}
        </select>
      </label>
      <p className="accounts-muted">{ACCOUNT_ROLES[role].summary}</p>
      {problem ? <p className="accounts-problem" role="alert">{problem}</p> : null}
      {created ? (
        <p className="accounts-sent" role="status">
          {`Invite created for ${created.email}. `}
          {created.link === undefined ? "It is listed under Invites below." : "Copy the link and send it to them. It works once, for 24 hours."}
          {created.link === undefined ? null : <button type="button" className="button" onClick={() => void copyLink(created.link as string)}>Copy link</button>}
          {copied === "yes" ? " Copied." : null}
          {copied === "no" ? " Could not copy. Select the link and copy it yourself." : null}
        </p>
      ) : null}
      <span className="accounts-buttons"><button type="submit" className="button primary">Invite</button></span>
    </form>
  );
}
