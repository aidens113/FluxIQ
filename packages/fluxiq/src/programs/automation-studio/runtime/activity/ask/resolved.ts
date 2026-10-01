import type { ClientGatewayActivityPhase, ClientGatewayActivityResolution } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioAsk } from "../../parking/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityClearedText } from "./cleared-text.ts";
import { automationStudioActivityAskIsPersonNeeded } from "./person-needed.ts";
import { automationStudioActivityAskTitle } from "./title.ts";

/** The resolutions the work goes on from; the others end the wait as a failure. */
const SUCCEEDED: ReadonlySet<ClientGatewayActivityResolution> = new Set<ClientGatewayActivityResolution>(["answered", "allowed", "waited_out"]);

/** What happened, in a sentence to the person who was asked. */
function saidOf(ask: Pick<AutomationStudioAsk, "control">, resolution: ClientGatewayActivityResolution, waitedMs: number | undefined): string {
  const personNeeded = automationStudioActivityAskIsPersonNeeded(ask);
  switch (resolution) {
    case "answered": return personNeeded ? "You pressed Continue." : "You answered.";
    case "allowed": return "You allowed it.";
    case "waited_out": return automationStudioActivityClearedText(waitedMs);
    case "declined": return personNeeded ? "You pressed Stop." : "You declined.";
    case "timed_out": return "Nobody answered in time.";
    case "cancelled": return "The work stopped before this was answered.";
  }
}

/**
 * Says a wait on the person is over, and how: the one row a client marks the
 * ask's card from. It is the ask row the wait opened with (`./ask.ts`) --
 * same `ref`, the ask id, and same title -- now `succeeded` or `failed`, with
 * the `resolution` and a sentence, under `phase`, the phase the work returns
 * to. Emitted where the wait settles, so a client never has to infer the
 * answer from what the work did next. `waitedMs`, when the wait was
 * `waited_out` and its length is known, says how long the check stood.
 */
export function emitAutomationStudioActivityAskResolved(
  ask: Pick<AutomationStudioAsk, "askId" | "kind" | "control">,
  resolution: ClientGatewayActivityResolution,
  phase: ClientGatewayActivityPhase,
  waitedMs?: number
): void {
  const said = saidOf(ask, resolution, waitedMs);
  emitAutomationStudioActivity({
    phase,
    label: said,
    detail: {
      kind: "ask",
      title: automationStudioActivityAskTitle(ask),
      text: said,
      status: SUCCEEDED.has(resolution) ? "succeeded" : "failed",
      ref: ask.askId,
      resolution
    }
  });
}
