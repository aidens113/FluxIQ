import type { ClientGatewayActivity, ClientGatewayActivitySkip } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "../emit.ts";

/**
 * Says that a run step was skipped rather than run (t416): one `step` row
 * about the node (`nodeId`), already `succeeded`, titled and labelled with
 * Core's sentence (`said`, "Already done for Lin Zhao"), and carrying the
 * closed `skipped` field so a client draws its card from it rather than from
 * the row's shape or the sentence. `step` is the step the row is numbered as,
 * when the emission site has one.
 *
 * `skipped.subject` is the plain words naming what was skipped: the list row's
 * label or the step's authored label, never other page data. A blank subject
 * is left out.
 */
export function emitAutomationStudioActivityStepSkipped(input: { nodeId: string; said: string; skipped: ClientGatewayActivitySkip; step?: ClientGatewayActivity["step"] }): void {
  const subject = input.skipped.subject?.trim();
  const skipped: ClientGatewayActivitySkip = { reason: input.skipped.reason, ...(subject ? { subject } : {}) };
  emitAutomationStudioActivity({
    phase: "running",
    label: input.said,
    ...(input.step ? { step: input.step } : {}),
    detail: { kind: "step", title: input.said, status: "succeeded", ref: input.nodeId, skipped }
  });
}
