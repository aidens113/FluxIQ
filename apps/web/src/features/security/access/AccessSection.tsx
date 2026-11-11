"use client";

import { useCallback } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { forgetPairedClient, loadAccess, loadPairedClients, revokeSession } from "../data";
import { SectionBody, useReloadableResource } from "../state";
import { PairedClientsList } from "./PairedClientsList";
import { PeopleList } from "./PeopleList";

/** Who can reach FluxIQ: people with their roles and sessions, and the browsers paired with it. */
export function AccessSection() {
  const identity = useProgramTransport("identity-access");
  const studio = useProgramTransport("automation-studio");
  const people = useReloadableResource(useCallback((signal: AbortSignal) => loadAccess(identity, signal), [identity]));
  const clients = useReloadableResource(useCallback((signal: AbortSignal) => loadPairedClients(signal), []));
  const now = Date.now();
  return (
    <section className="security-section" aria-labelledby="security-access">
      <h2 id="security-access">Access</h2>
      <h3>People</h3>
      <SectionBody resource={people.resource} noun="who has access">
        {(access) => <PeopleList access={access} onRevoke={(digest) => revokeSession(identity, digest)} onDone={people.reload} />}
      </SectionBody>
      <h3>Paired browsers</h3>
      <SectionBody resource={clients.resource} noun="your paired browsers">
        {(rows) => <PairedClientsList rows={rows} now={now} onForget={(id) => forgetPairedClient(studio, id)} onDone={clients.reload} />}
      </SectionBody>
    </section>
  );
}
