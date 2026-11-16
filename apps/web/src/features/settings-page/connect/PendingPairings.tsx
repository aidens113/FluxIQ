"use client";

import { useState } from "react";
import { resolvePairing } from "./resolve-pairing";
import type { PendingPairing } from "./pending-pairing";

/** Requests waiting for approval. Approve pairs the client and it can use models at once; Dismiss turns the request away. */
export function PendingPairings(props: { requests: PendingPairing[]; onDone: () => void }) {
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  async function act(action: "approve" | "dismiss", pairingCode: string) {
    setBusy(pairingCode);
    setProblem("");
    const outcome = await resolvePairing(action, pairingCode);
    setBusy("");
    setProblem(outcome.ok ? "" : outcome.problem);
    props.onDone();
  }
  if (props.requests.length === 0) return <p>No requests are waiting. Start pairing from the extension and it appears here.</p>;
  return (
    <>
      {problem ? <p role="alert">{problem}</p> : null}
      <ul aria-label="Pairing requests waiting">
        {props.requests.map((request) => (
          <li key={request.pairingCode}>
            <strong>{request.name}</strong> <span>Code <code>{request.reference}</code>. Approve only if it matches the code the extension shows.</span>
            <button type="button" disabled={busy !== ""} onClick={() => void act("approve", request.pairingCode)}>Approve</button>
            <button type="button" disabled={busy !== ""} onClick={() => void act("dismiss", request.pairingCode)}>Dismiss</button>
          </li>
        ))}
      </ul>
    </>
  );
}
