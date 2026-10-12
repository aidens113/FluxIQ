import type { ClientGatewayActivityRecovery } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "../emit.ts";

/** What a card says when the emission site has no subject of its own. */
const FALLBACK_SUBJECT: Readonly<Record<ClientGatewayActivityRecovery["kind"], string>> = Object.freeze({
  handler: "A recovery step",
  entry: "Another starting point",
  route: "Another place in the Flow",
  alternative: "Another way",
  interference: "Closed a notice the page put in the way"
});

/** Core's live line for each outcome. */
const OUTCOME_WORDS: Readonly<Record<ClientGatewayActivityRecovery["outcome"], string>> = Object.freeze({
  succeeded: "Recovered",
  failed: "Recovery did not work",
  refused: "Recovery not tried"
});

/**
 * Says one recovery settled on a run step (state-aware recovery plan, C11): a
 * lifecycle handler that ran, an alternative entry a frame began at, a route,
 * an alternative path, or a layer the client closed over the page. The row is a `step` row about the node it recovered
 * (`ref`), titled with the recovery's `subject`, and carries the closed
 * `recovery` detail so a client renders the card without parsing the label.
 * The live line reads "Recovered: <subject>", "Recovery did not work:
 * <subject>" or "Recovery not tried: <subject>".
 *
 * `subject` is the plain words a card shows: an authored handler, entry or
 * checkpoint label, or Core's own words; never page text. An empty subject
 * reads as the kind's own words ("Another way"). `event` is kept only on a
 * `handler` recovery. Like `./recovering.ts`, it names no `step`: it opens no
 * step of its own. A recovery that moved the run on leaves it `running`; one
 * that did not keeps it `repairing`.
 */
export function emitAutomationStudioActivityStepRecovery(input: { nodeId: string; recovery: ClientGatewayActivityRecovery }): void {
  const { kind, outcome, event, targetId } = input.recovery;
  const subject = input.recovery.subject.trim() || FALLBACK_SUBJECT[kind];
  const recovery: ClientGatewayActivityRecovery = {
    kind,
    subject,
    outcome,
    ...(kind === "handler" && event !== undefined ? { event } : {}),
    ...(targetId !== undefined ? { targetId } : {})
  };
  emitAutomationStudioActivity({
    phase: outcome === "succeeded" ? "running" : "repairing",
    label: `${OUTCOME_WORDS[outcome]}: ${subject}`,
    detail: { kind: "step", title: subject, status: outcome === "succeeded" ? "succeeded" : "failed", ref: input.nodeId, recovery }
  });
}
