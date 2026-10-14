import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";

/** An honest ending the model completed with, once the check accepted it. */
export type AutomationStudioProjectSupervisorEnded = { outcome: "blocked" | "partial"; reason: string };

/** What the supervisor completes with: the latest assembled revision, or an honest ending. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
  properties: { revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string" } },
  additionalProperties: false
};

/**
 * The supervisor's completion rule. Either exactly the latest assembled
 * candidate's revision and digest, accepted only once the whole trial gate
 * says yes for that exact revision (`AutomationStudioFlowCandidateTrialGate`,
 * `completion`); or an honest ending -- `ended` blocked or partial, with a
 * reason -- accepted only once something has stopped the build: a brief came
 * back blocked or partial, or a whole trial did not pass. `ended` is told the
 * ending the check accepted, for the caller to record.
 */
export function automationStudioProjectSupervisorCompletion(context: AutomationStudioProjectSupervisorContext, ended: (ending: AutomationStudioProjectSupervisorEnded) => void): (result: JsonObject) => AutomationStudioLlmEvidenceCompletionCheck {
  return (result) => {
    const keys = Object.keys(result);
    if (result.ended !== undefined) {
      const reason = typeof result.reason === "string" ? result.reason.trim() : "";
      if ((result.ended !== "blocked" && result.ended !== "partial") || !reason || keys.some((key) => key !== "ended" && key !== "reason")) return refused("project.completion_shape", GUIDANCE.completion.shape);
      if (!context.state.anyNotDone() && !context.state.wholeTrialFailed) return refused("project.completion_ended_too_soon", GUIDANCE.completion.endedTooSoon);
      ended({ outcome: result.ended, reason: reason.slice(0, 2000) });
      return { ok: true };
    }
    const candidate = context.controller.latest();
    if (!candidate) return refused("project.completion_nothing_assembled", GUIDANCE.completion.nothingAssembled, { submitted: false });
    const named = typeof result.revision === "number" && typeof result.digest === "string" && keys.every((key) => key === "revision" || key === "digest");
    if (!named || !context.controller.matches({ revision: result.revision as number, digest: result.digest as string, baseDependencyDigest: candidate.baseDependencyDigest })) {
      return refused("project.completion_not_latest", GUIDANCE.completion.notLatest, { submitted: true, complete: { revision: candidate.revision, digest: candidate.digest } });
    }
    return context.gate.completion({ revision: candidate.revision, digest: candidate.digest });
  };
}

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}
