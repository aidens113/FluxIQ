"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { AccountsAdmin, applyMemberChange, loadMembers, MemberActions, sendInvite, TwoStepContext, type CredentialProof, type MemberChange, type MemberSource, type MembersView } from "../../accounts";
import type { Resource } from "../../home/data";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { loadAccess, revokeSession } from "../data";
import type { Guarded } from "../model";
import { SectionBody, useReloadableResource } from "../state";
import { PeopleList } from "./PeopleList";

/** The administrator's view of the people once the server allowed it; null while loading, when refused (anyone not managing people) or when it could not be read. */
function readyMembers(resource: Resource<Guarded<MembersView>>): MembersView | null {
  return resource.state === "ready" && resource.data.state === "ready" ? resource.data.data : null;
}

/**
 * Who can use this FluxIQ: each person with their role in words and their
 * sign-ins. For someone the server lets manage people (the members list is
 * decided like every change), each person gets their access controls and the
 * section ends with inviting people and the invites waiting. Hiding the
 * controls is for clarity only: every change is decided again on the server.
 * `twoStep` says whether the viewer's confirmations also ask for an
 * authenticator code.
 */
export function PeopleSection(props: { twoStep: boolean }) {
  const identity = useProgramTransport("identity-access");
  const people = useReloadableResource(useCallback((signal: AbortSignal) => loadAccess(identity, signal), [identity]));
  // A refusal is remembered for the page's life: someone who does not manage
  // people is not asked again every refresh, which would only add a denied
  // decision to the activity each time. Reloading the page asks again.
  const membersDenied = useRef(false);
  const members = useReloadableResource(useCallback(async (signal: AbortSignal): Promise<Guarded<MembersView>> => {
    if (membersDenied.current) return { state: "denied" };
    const answer = await loadMembers(signal);
    if (answer.state === "denied") membersDenied.current = true;
    return answer;
  }, []));
  const now = Date.now();
  const view = readyMembers(members.resource);
  const reloadPeople = () => {
    people.reload();
    members.reload();
  };
  const apply = (source: MemberSource) => (change: MemberChange, proof?: CredentialProof) => applyMemberChange(source, change, proof, identity);
  const actions = view === null ? undefined : (personId: string): ReactNode => {
    const member = view.members.find((candidate) => candidate.userId === personId);
    return member ? <MemberActions member={member} view={view} onApply={apply(member.source)} onDone={reloadPeople} /> : null;
  };
  const admin = view !== null
    ? <AccountsAdmin view={view} now={now} onInvite={sendInvite} onApply={apply("account")} onDone={reloadPeople} />
    : members.resource.state === "error" ? <p className="security-note security-error" role="alert">Could not read the people you manage. Reload to try again.</p> : undefined;
  return (
    <TwoStepContext.Provider value={props.twoStep}>
      <section className="security-section" aria-labelledby="security-people">
        <h2 id="security-people">People</h2>
        <SectionBody resource={people.resource} noun="who has access">
          {(access) => <PeopleList access={access} onRevoke={(digest) => revokeSession(identity, digest)} onDone={reloadPeople} actions={actions} admin={admin} />}
        </SectionBody>
      </section>
    </TwoStepContext.Provider>
  );
}
