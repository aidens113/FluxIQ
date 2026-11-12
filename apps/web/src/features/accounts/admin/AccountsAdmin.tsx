import "../accounts.css";
import type { AccountsOutcome, CredentialProof, InviteRequest, MemberChange, MembersView } from "../model";
import { InviteForm } from "../invite";
import { PendingInvites } from "../invites";

/**
 * The administrator's part of the Access section: inviting a person and the
 * invites still waiting. Shown only to someone the members list was allowed
 * for; every action is decided again on the server.
 */
export function AccountsAdmin(props: {
  view: MembersView;
  now: number;
  onInvite: (invite: InviteRequest, proof: CredentialProof) => Promise<AccountsOutcome>;
  onApply: (change: MemberChange, proof?: CredentialProof) => Promise<AccountsOutcome>;
  onDone: () => void;
}) {
  return (
    <div className="accounts-admin">
      <h3>Invite someone</h3>
      {props.view.assignableRoles.length > 0 ? (
        <InviteForm roles={props.view.assignableRoles} onInvite={props.onInvite} onDone={props.onDone} />
      ) : (
        <p className="security-note">No role can be given here.</p>
      )}
      <h3>Invites</h3>
      <PendingInvites members={props.view.members} now={props.now} onApply={props.onApply} onDone={props.onDone} />
    </div>
  );
}
