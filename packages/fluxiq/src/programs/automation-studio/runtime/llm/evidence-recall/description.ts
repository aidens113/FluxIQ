// What the model is told `core.recall_result` does.
//
// Its own file so the tool descriptions can be reviewed together (t235): this
// one is new in t194 w48 and is the only text of the tool the model reads.
// Held to the loop's 2,000 characters (`../evidence-loop-decision.ts`).
//
// Core's own words only: the domain says which of its members are held views,
// and the web domain's read tells the model, in the read itself, that its rows
// come back here (`domain/src/runtime/llm-evidence/node-run/shown-rows/account.ts`).

export const AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION =
  "Get back, whole, what an earlier result held that a newer result has since replaced: where a member of an earlier result shows supersededBy in place of what it held -- such as the rows of an earlier read -- name that earlier result's callId and receive what it held exactly as it first came back. Only the newest of each kind is shown whole, so ask here rather than running the same call again. It looks at nothing, changes nothing and is never a step of the Flow.";
