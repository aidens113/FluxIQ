// A client's answer to Core asking what became of one command (Core C8,
// `server.reconcile_command`). It is decided from what the client kept --
// never by acting -- in this order:
//
//  - **running**: the command is being carried out here now;
//  - **landed**: a result is kept for it (just sent, or waiting in the offline
//    queue), and that result goes back with the answer. A result the client
//    reported as interrupted is still the result it has;
//  - **unknown**: the client had it -- a record an earlier worker left without
//    a result, or an id it remembers receiving whose result it no longer
//    holds -- and cannot say what became of it. Core does not act again;
//  - **not_seen**: nothing at all: the command never reached this client, so
//    making it again is not a second act. The client refuses that id from
//    then on (`./command-reconciliation.ts`).

import type { ClientGatewayActionResult, ClientGatewayReconcileAnswer } from "@fluxiq/contracts/client-gateway";

/** What a client knows about one command id. */
export type ClientGatewayCommandKnowledge = {
  running: boolean;
  result?: ClientGatewayActionResult | undefined;
  recordLeft: boolean;
  seen: boolean;
};

export function clientGatewayReconcileAnswer(commandId: string, known: ClientGatewayCommandKnowledge): ClientGatewayReconcileAnswer {
  if (known.running) return { commandId, state: "running" };
  if (known.result !== undefined) return { commandId, state: "landed", result: known.result };
  if (known.recordLeft || known.seen) return { commandId, state: "unknown" };
  return { commandId, state: "not_seen" };
}
