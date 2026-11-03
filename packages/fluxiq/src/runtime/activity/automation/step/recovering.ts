import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel } from "../wording/index.ts";

/** A result code as a record may carry it: one token of letters, digits, `.`, `_`, `:`, `-`. */
const CODE = /^[A-Za-z0-9._:-]{1,200}$/u;
/** A definition id as `./started.ts` carries it in `Node: <id>`. */
const DEFINITION = /^[A-Za-z][\w.-]*$/u;

/**
 * Says a run step failed and the run is recovering from it, in one row that
 * comes right after the step's own "Running step N of M" (`./started.ts`): the
 * live line reads "Recovering from a failed step: <label>", and the row
 * settles that step as failed (`detail.status: "failed"`, `ref` the node it
 * ran) with why, in the record a tool row carries: "Result: <failure code> ·
 * Node: <definition>" (`ui/activity-action/record.ts`). A chat words the code
 * ("web.action.rate_limited" -> "the page was busy"); a playback card that
 * failed once read "Didn't work" with no reason, since no row carried the code
 * (D8, `run-murwd8le-79e735a8`). Only codes travel: the failure's own message
 * is the page's words and is never a row's.
 *
 * It names no `step`: it opens no step of its own, and a chat that shows run
 * steps does not show it as one (it said "Recovery started" before t174/w88).
 */
export function emitAutomationStudioActivityStepRecovering(input: { nodeId: string; label?: string | undefined; definitionId?: string | undefined; parameters?: unknown; failureCode?: string | undefined }): void {
  const label = automationStudioActivityHumanLabel(input.label, 160);
  const action = automationStudioActivityAction({ id: input.definitionId, parameters: input.parameters, label });
  const code = typeof input.failureCode === "string" && CODE.test(input.failureCode) ? input.failureCode : undefined;
  const definition = typeof input.definitionId === "string" && DEFINITION.test(input.definitionId) ? input.definitionId : undefined;
  const record = [code ? `Result: ${code}` : "", definition ? `Node: ${definition}` : ""].filter(Boolean).join(" · ");
  const named = input.label?.trim();
  emitAutomationStudioActivity({
    phase: "repairing",
    label: `Recovering from a failed step${named ? `: ${named}` : ""}`,
    detail: { kind: "step", title: action ?? "Step failed", status: "failed", ref: input.nodeId, ...(record ? { text: record } : {}) }
  });
}
