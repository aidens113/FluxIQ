import type { AutomationStudioClearedLayerKind } from "../../executor/index.ts";
import { emitAutomationStudioActivityStepRecovery } from "./recovery.ts";

/** Core's own words for one layer over the page, by its generic kind (CC7): what was closed, or what a press tried to close. */
const ONE_LAYER: Readonly<Record<AutomationStudioClearedLayerKind, string>> = Object.freeze({
  overlay: "something the page put over itself",
  rate_limit: "a slow-down notice the page put in the way",
  notice: "a notice the page put in the way",
  assistant: "a chat window the page put in the way",
  other: "a dialog the page put in the way"
});

/**
 * Says that layers the page put over itself were closed while a step ran
 * (state-aware recovery plan, C11): one `step` row with an `interference`
 * recovery about the node (`nodeId`). Nothing is said when no layer was named.
 *
 * `outcome` is `succeeded` unless said otherwise: the client closed the layers
 * itself, or Core's interference rung pressed a layer's way out and it worked
 * (`../../executor/ladder-run.ts`, t799). A press that did not work says
 * `failed`, with the subject "Tried to close ..." instead of "Closed ...".
 *
 * The subject is Core's own words by layer kind ("Closed a notice the page
 * put in the way"), or "Closed N notices the page put in the way" for
 * several. It never carries the dismiss control's words, which stay on the
 * attempt trace, nor any other page text.
 */
export function emitAutomationStudioActivityStepInterference(input: { nodeId: string; kinds: readonly AutomationStudioClearedLayerKind[]; outcome?: "succeeded" | "failed" }): void {
  const count = input.kinds.length;
  if (count === 0) return;
  const outcome = input.outcome ?? "succeeded";
  const verb = outcome === "succeeded" ? "Closed" : "Tried to close";
  const subject = count === 1 ? `${verb} ${ONE_LAYER[input.kinds[0]!]}` : `${verb} ${count} notices the page put in the way`;
  emitAutomationStudioActivityStepRecovery({ nodeId: input.nodeId, recovery: { kind: "interference", subject, outcome } });
}
