import type { AutomationStudioClearedLayerKind } from "../../executor/index.ts";
import { emitAutomationStudioActivityStepRecovery } from "./recovery.ts";

/** Core's own words for one closed layer, by its kind. */
const ONE_LAYER: Readonly<Record<AutomationStudioClearedLayerKind, string>> = Object.freeze({
  consent: "Closed a consent notice the page put in the way",
  rate_limit: "Closed a slow-down notice the page put in the way",
  promotion: "Closed a promotion the page put in the way",
  assistant: "Closed a chat window the page put in the way",
  dialog: "Closed a notice the page put in the way"
});

/**
 * Says that the client closed layers the page put over itself while a step
 * ran (state-aware recovery plan, C11): one `step` row with an `interference`
 * recovery that `succeeded`, about the node (`nodeId`). Nothing is said when
 * no layer was closed.
 *
 * The subject is Core's own words by layer kind ("Closed a notice the page
 * put in the way"), or "Closed N notices the page put in the way" for
 * several. It never carries the dismiss control's words, which stay on the
 * attempt trace, nor any other page text.
 */
export function emitAutomationStudioActivityStepInterference(input: { nodeId: string; kinds: readonly AutomationStudioClearedLayerKind[] }): void {
  const count = input.kinds.length;
  if (count === 0) return;
  const subject = count === 1 ? ONE_LAYER[input.kinds[0]!] : `Closed ${count} notices the page put in the way`;
  emitAutomationStudioActivityStepRecovery({ nodeId: input.nodeId, recovery: { kind: "interference", subject, outcome: "succeeded" } });
}
