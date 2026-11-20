"use client";

import { useState } from "react";
import { resolvePairing } from "./resolve-pairing";
import type { PendingPairing } from "./pending-pairing";
import { usePairingDialogCode } from "./use-pairing-dialog-code";

/** Requests waiting for approval. Approve pairs the client and it can use models at once; Dismiss turns the request away. While the confirmation dialog is open for a request, that request is answered there. */
export function PendingPairings(props: { requests: PendingPairing[]; onDone: () => void }) {
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const inDialog = usePairingDialogCode();
  async function act(action: "approve" | "dismiss", pairingCode: string) {
    setBusy(pairingCode);
    setProblem("");
    const outcome = await resolvePairing(action, pairingCode);
    setBusy("");
    setProblem(outcome.ok ? "" : outcome.problem);
    props.onDone();
  }
  if (props.requests.length === 0) return <p className="devices-muted">Nothing is waiting. When you connect a browser or app, its request appears here.</p>;
  return (
    <>
      {problem ? <p role="alert" className="devices-problem">{problem}</p> : null}
      <ul aria-label="Pairing requests waiting" className="devices-pairings">
        {props.requests.map((request) => {
          const handledInDialog = inDialog !== null && inDialog === request.reference;
          return (
            <li key={request.pairingCode} className="devices-pairing">
              <strong>{request.name}</strong>
              <span className="devices-muted">Code <code>{request.reference}</code>. Approve only if it matches the code shown in the app you are connecting.</span>
              {handledInDialog ? (
                <span role="status" className="devices-pairing-dialog">Being handled in the confirmation dialog.</span>
              ) : (
                <span className="devices-pairing-actions">
                  <button type="button" className="button primary" disabled={busy !== ""} onClick={() => void act("approve", request.pairingCode)}>Approve</button>
                  <button type="button" className="button" disabled={busy !== ""} onClick={() => void act("dismiss", request.pairingCode)}>Decline</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
