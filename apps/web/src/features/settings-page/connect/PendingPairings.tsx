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
  if (props.requests.length === 0) return <p className="settings-muted">No requests are waiting. Start pairing from the extension and it appears here.</p>;
  return (
    <>
      {problem ? <p role="alert" className="settings-problem">{problem}</p> : null}
      <ul aria-label="Pairing requests waiting" className="settings-pairings">
        {props.requests.map((request) => {
          const handledInDialog = inDialog !== null && inDialog === request.reference;
          return (
            <li key={request.pairingCode} className="settings-pairing">
              <strong>{request.name}</strong>
              <span className="settings-muted">Code <code>{request.reference}</code>. Approve only if it matches the code the extension shows.</span>
              {handledInDialog ? (
                <span role="status" className="settings-pairing-dialog">Being handled in the confirmation dialog.</span>
              ) : (
                <span className="settings-pairing-actions">
                  <button type="button" className="button primary" disabled={busy !== ""} onClick={() => void act("approve", request.pairingCode)}>Approve</button>
                  <button type="button" className="button" disabled={busy !== ""} onClick={() => void act("dismiss", request.pairingCode)}>Dismiss</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
