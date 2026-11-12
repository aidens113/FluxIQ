"use client";

import { useState } from "react";
import "../accounts.css";
import { ACCOUNT_ROLES, type AccountsOutcome, type AssignableRole, type CredentialProof, type MemberChange, type MemberRow, type MembersView } from "../model";
import { ProofForm } from "../proof";

type Step = { change: MemberChange; question: string; confirmLabel: string; danger: boolean };

/**
 * One person's access, for an administrator: their role, turning their sign-in
 * off or on, and removing them. Each change is confirmed with the
 * administrator's own credentials and decided again on the server. Nothing is
 * offered for the viewer themselves or for the owner, and an invite is handled
 * in the invites list.
 */
export function MemberActions(props: { member: MemberRow; view: Pick<MembersView, "assignableRoles" | "canRemove">; onApply: (change: MemberChange, proof: CredentialProof) => Promise<AccountsOutcome>; onDone: () => void }) {
  const { member, view } = props;
  const roles = view.assignableRoles.filter((role) => member.source === "account" || role !== "member");
  const [role, setRole] = useState<AssignableRole | undefined>(roles.find((candidate) => candidate === member.role) ?? roles[0]);
  const [step, setStep] = useState<Step | null>(null);

  if (member.self) return <span className="accounts-muted">Your own access is changed by another administrator.</span>;
  if (member.role === "owner") return <span className="accounts-muted">The owner's access is changed only by whoever runs this FluxIQ.</span>;
  if (member.state === "invited") return <span className="accounts-muted">Invited. Their invite is listed under Invites.</span>;

  if (step !== null) {
    const finish = () => {
      setStep(null);
      props.onDone();
    };
    return <ProofForm question={step.question} confirmLabel={step.confirmLabel} danger={step.danger} onConfirm={(proof) => props.onApply(step.change, proof)} onDone={finish} onCancel={() => setStep(null)} />;
  }

  const name = member.name;
  const canRemove = view.canRemove && member.source === "account";
  return (
    <span className="accounts-actions">
      {roles.length > 0 && role !== undefined ? (
        <>
          <label className="accounts-inline">Role
            <select value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>
              {roles.map((candidate) => <option key={candidate} value={candidate}>{ACCOUNT_ROLES[candidate].label}</option>)}
            </select>
          </label>
          <button type="button" className="accounts-button" disabled={role === member.role} onClick={() => setStep({ change: { action: "set-role", userId: member.userId, role }, question: `Make ${name} ${ACCOUNT_ROLES[role].label.toLowerCase()}? ${ACCOUNT_ROLES[role].summary}`, confirmLabel: "Change role", danger: false })}>Change role</button>
        </>
      ) : null}
      {member.state === "turned-off" ? (
        <button type="button" className="accounts-button" onClick={() => setStep({ change: { action: "turn-on", userId: member.userId }, question: `Let ${name} sign in again?`, confirmLabel: "Turn on", danger: false })}>Turn on</button>
      ) : (
        <button type="button" className="accounts-button" onClick={() => setStep({ change: { action: "turn-off", userId: member.userId }, question: `Turn ${name} off? They are signed out everywhere and cannot sign in until turned on.`, confirmLabel: "Turn off", danger: true })}>Turn off</button>
      )}
      {canRemove ? (
        <button type="button" className="accounts-button accounts-danger" onClick={() => setStep({ change: { action: "remove", userId: member.userId }, question: `Remove ${name}? Their account is deleted and they can no longer sign in. This cannot be undone.`, confirmLabel: "Remove", danger: true })}>Remove</button>
      ) : null}
    </span>
  );
}
