"use client";

import { useState } from "react";
import { agoText } from "../../home/model";
import { ACCOUNT_ROLES, type AccountsOutcome, type CredentialProof, type MemberChange, type MemberRow } from "../model";
import { ProofForm } from "../proof";

function resendNote(outcome: AccountsOutcome, name: string): string {
  if (outcome.kind === "done") return `A new invite is on its way to ${name}. The earlier link no longer works.`;
  if (outcome.kind === "denied") return "You do not have access to do this.";
  if (outcome.kind === "refused" || outcome.kind === "needs-proof") return outcome.message;
  return "That did not work. Try again.";
}

function PendingInvite(props: { member: MemberRow; now: number; onApply: (change: MemberChange, proof?: CredentialProof) => Promise<AccountsOutcome>; onDone: () => void }) {
  const { member } = props;
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();

  async function resend() {
    setBusy(true);
    setNote(undefined);
    let outcome: AccountsOutcome;
    try {
      outcome = await props.onApply({ action: "resend-invite", userId: member.userId });
    } catch {
      outcome = { kind: "failed" };
    }
    setBusy(false);
    setNote(resendNote(outcome, member.name));
  }

  const finish = () => {
    setRevoking(false);
    props.onDone();
  };

  return (
    <li className="security-row accounts-invite">
      <span className="security-title">{member.name}</span>
      <span className="security-muted">{member.email} · {ACCOUNT_ROLES[member.role].label} · invited {agoText(member.invitedAt ?? undefined, props.now)}</span>
      {revoking ? (
        <ProofForm question={`Cancel ${member.name}'s invite? Their link stops working and their account is deleted.`} confirmLabel="Cancel invite" danger onConfirm={(proof) => props.onApply({ action: "revoke-invite", userId: member.userId }, proof)} onDone={finish} onCancel={() => setRevoking(false)} />
      ) : (
        <span className="accounts-actions">
          <button type="button" className="accounts-button" disabled={busy} onClick={() => void resend()}>{busy ? "Sending…" : "Resend"}</button>
          <button type="button" className="accounts-button accounts-danger" disabled={busy} onClick={() => setRevoking(true)}>Cancel invite</button>
          {note ? <span className="accounts-muted" role="status">{note}</span> : null}
        </span>
      )}
    </li>
  );
}

/**
 * Invites not yet accepted: who, with what role, and when. Resend mails a new
 * link (the earlier one stops working); cancelling deletes the account, after
 * the administrator confirms with their own credentials. A link is never
 * shown here: it goes only to the person's inbox.
 */
export function PendingInvites(props: { members: MemberRow[]; now: number; onApply: (change: MemberChange, proof?: CredentialProof) => Promise<AccountsOutcome>; onDone: () => void }) {
  const pending = props.members.filter((member) => member.state === "invited" && member.source === "account");
  if (pending.length === 0) return <p className="security-note">No invites are waiting.</p>;
  return (
    <ul className="security-list" aria-label="Invites waiting to be accepted">
      {pending.map((member) => <PendingInvite key={member.userId} member={member} now={props.now} onApply={props.onApply} onDone={props.onDone} />)}
    </ul>
  );
}
