// What one provider call may come back as: run a tool, edit the draft, or
// finish. The grammar that parses a reply into one of these, and the schema the
// model is shown, are in `../evidence-loop-decision.ts`; this is only the shape
// the loop then acts on.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";

export type AutomationStudioLlmEvidenceLoopDecision =
  /**
   * Run one tool. `add` puts the step it takes into the Flow if it works, and
   * `act` names the instructed act that step does, and `place` the places on
   * the route the person named it is on (D phase 2); all only where the model
   * authors its draft (`../../flow-draft/step.ts`, `taken`).
   */
  | { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; add?: true; act?: string; place?: string; usage?: AutomationStudioLlmUsageSummary }
  /** An edit to the draft the loop is accruing. Offered only once there is a step to edit. */
  | { kind: "amend_draft"; amendments: readonly AutomationStudioFlowDraftAmendment[]; usage?: AutomationStudioLlmUsageSummary }
  | { kind: "complete"; result: JsonObject; usage?: AutomationStudioLlmUsageSummary };
