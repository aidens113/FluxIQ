// What one call did, as the record the draft and the row are written from.
//
// Two readings of the same call, and both are the caller's rather than the
// tool's. A tool that runs whichever of a library's things the call names is the
// reason: the effect, the name and whether a result should contain it are
// properties of the call, not of the tool, so a declaration made once for all
// calls cannot answer for any of them.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStepReplay } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "./tool.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "./tool-execution.ts";
import { automationStudioLlmEvidenceDiagnostic } from "../evidence-diagnostic/index.ts";

/**
 * What a call said about its own outcome beyond the code it came to: why it
 * came to it, and which node it ran.
 *
 * Both are the caller's, both are closed vocabulary
 * (`../evidence-loop-decision.ts` drops anything that is not), and both are
 * absent whenever the caller said nothing -- a call that simply worked usually
 * does.
 */
export function automationStudioLlmEvidenceCallDiagnostic(execution: { resultReason?: string; nodeId?: string; diagnostic?: JsonObject; draft?: { actionId?: string } | undefined }): { resultReason?: string; nodeId?: string; diagnostic?: JsonObject } {
  // A call that worked usually names no node of its own, while the draft entry
  // it declared does: `run-mulx76vv-a882551e` published a node id only on its
  // refused rows, so which node any of its nine successful actions ran could
  // not be read. The declared action is the caller's resolution, never a name
  // the model wrote, so it answers the same question.
  const nodeId = execution.nodeId ?? execution.draft?.actionId;
  const diagnostic = automationStudioLlmEvidenceDiagnostic(execution.diagnostic);
  return {
    ...(execution.resultReason ? { resultReason: execution.resultReason } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(diagnostic ? { diagnostic } : {})
  };
}

/**
 * What one call did, as the caller reported it, over what its tool declared.
 */
export function automationStudioLlmEvidenceCallRecord(
  tool: AutomationStudioLlmEvidenceTool,
  input: JsonObject,
  execution?: { draft?: AutomationStudioLlmEvidenceToolExecutionResult["draft"] }
): { actionId: string; toolId?: string; input: JsonObject; ranWith?: JsonObject; effect: "observe" | "mutate"; proposes?: boolean; replay?: AutomationStudioFlowDraftStepReplay; control?: string; interruption?: true } {
  const declared = execution?.draft;
  const actionId = declared?.actionId ?? tool.toolId;
  return {
    actionId,
    ...(actionId === tool.toolId ? {} : { toolId: tool.toolId }),
    input: declared?.input ?? input,
    ...(declared?.ranWith === undefined ? {} : { ranWith: declared.ranWith }),
    effect: declared?.effect ?? tool.effect ?? "observe",
    ...(declared?.proposes === undefined ? {} : { proposes: declared.proposes }),
    ...(declared?.replay === undefined ? {} : { replay: declared.replay }),
    // The words of what it acted on, already screened on the parse path; shown beside `input` (`../../flow-draft/entry.ts`).
    ...(declared?.control === undefined ? {} : { control: declared.control }),
    // The caller's word that it answered a layer gone after it (`../../flow-draft/step.ts`).
    ...(declared?.interruption === true ? { interruption: true as const } : {})
  };
}
