// The causal chains a trace event belongs to, within which a replay must keep
// the recorded order (traces and offline trials, P3 D22). Live intake handles
// one socket's frames concurrently, so the order in which concurrently handled
// inputs finish is nondeterministic by design; parity therefore compares order
// per chain, never the global interleaving:
//
// - `inputs`: every input (an inbound message, an uploaded artifact), in the
//   order it was received;
// - `input|<key>`: one input and the disposition it caused;
// - `command|<id>`: a command's outbound message, its answers, their
//   dispositions and the outcomes Core synthesized for it;
// - `uncorrelated`: everything else (lifecycle, a message for no command),
//   in recorded order among themselves.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";

/**
 * The chains of `event`, named by the alignment keys of its trace (`keys`,
 * event id to key), so the recorded and the replayed event of one delivery
 * point name the same chains.
 */
export function clientGatewayTraceCausalChains(event: ClientGatewayTraceEvent, keys: ReadonlyMap<string, string>): string[] {
  const chains: string[] = [];
  if (event.kind === "inbound" || event.kind === "artifact") {
    chains.push("inputs");
    chains.push(`input|${keys.get(event.eventId) ?? `unkeyed:${event.eventId}`}`);
  }
  if (event.kind === "disposition") {
    const cause = event.correlation.causationEventId;
    chains.push(`input|${cause === null ? "uncaused" : keys.get(cause) ?? `unkeyed:${cause}`}`);
  }
  const commandId = event.correlation.commandId;
  if (commandId !== null) chains.push(`command|${commandId}`);
  if (chains.length === 0) chains.push("uncorrelated");
  return chains;
}
