// What one provider call may come back as: run a tool, edit the draft, or
// finish. The grammar that parses a reply into one of these, and the schema the
// model is shown, are in `../evidence-loop-decision.ts`; this is only the shape
// the loop then acts on.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";

export type AutomationStudioLlmEvidenceLoopDecision =
  | { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; usage?: AutomationStudioLlmUsageSummary }
  /** An edit to the draft the loop is accruing. Offered only once there is a step to edit. */
  | { kind: "amend_draft"; amendments: readonly AutomationStudioFlowDraftAmendment[]; usage?: AutomationStudioLlmUsageSummary }
  | { kind: "complete"; result: JsonObject; usage?: AutomationStudioLlmUsageSummary };
