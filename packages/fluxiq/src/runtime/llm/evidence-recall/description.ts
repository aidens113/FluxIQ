// What the model is told `core.recall_result` does.
//
// Its own file so the tool descriptions can be reviewed together (t235): this
// one is new in t194 w48 and is the only text of the tool the model reads.
// Held to the loop's 2,000 characters (`../evidence-loop-decision.ts`).
//
// Core describes its projection; clients declare held view members.

export const AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION =
  "Recover the original held view members of an earlier tool result by naming its callId. Historical core.view_reference values identify the original call and group; core.current_view holds only each group's latest whole view. Recall returns remembered original members without observing or acting again. Its restored view has an independent current-view group, so recalling history does not replace the current client view. It changes nothing and is never a step of the Flow.";
