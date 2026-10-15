// The candidate build's memory of its last refused submission, for the
// failure to carry as codes (`./refusal-codes.ts`, t378).
//
// The loop answers a refused submission with its issues and moves on; only
// the issue codes of the refusal that ended it reach the stall, and a stall
// after a submission sent again unchanged carries only the repeat guard's code.
// So the build watches its own submissions as they are answered -- the same
// seam the activity observer wraps (`../../activity/observer.ts`), every call
// and result passed through unchanged -- and, when it stalls, reads the trace
// for how many times the refused one was sent again.
//
// **A subflow builder's submissions too (t630).** A project build's builder
// submits with `core.submit_subflow`, and its stall carried only the repeat
// guard's code, so A8 wave 7 `run-mv9dd0fk-8cd2e522` came back blocked on
// "subflow.scope_refused:b54daa6d" with `subflow.input_unread` behind the
// digest. The submit tool watched is the caller's, `core.submit_candidate`
// unless it names another, and the project build watches each builder's own
// (`../project-build/brief-ports.ts`).
import { automationStudioActivityIssuesOf } from "../../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";
import { automationStudioCandidateRefusalCodes } from "./refusal-codes.ts";

/** `core.submit_candidate` (`../../flow-bootstrap/candidate/authoring-loop.ts`), as a plain string: the submit tool watched unless the caller names another. */
const SUBMIT_CANDIDATE = "core.submit_candidate";
/** The loop's codes for a call it did not run because the same call was made before (`../../llm/repeat-guard/`, `../../llm/evidence-loop/answered-request.ts`). */
const SENT_AGAIN: ReadonlySet<string> = new Set(["llm_evidence_loop.repeat_refused", "llm_evidence_loop.already_answered"]);

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/**
 * `observe` wraps a loop's input so each answer of `submitToolId` is noted;
 * `codes` is what the build's stall carries of the last one, when it was
 * refused.
 */
export function automationStudioCandidateSubmissionRefusals(submitToolId: string = SUBMIT_CANDIDATE): {
  observe(loop: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput;
  codes(stall: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[] }): string[];
} {
  let refusals = 0;
  let issues: ReturnType<typeof automationStudioActivityIssuesOf> = [];
  let family: string | undefined;
  const noted = (result: unknown): void => {
    const answer = record(record(result)?.evidence);
    if (answer?.ok === true) { refusals = 0; issues = []; family = undefined; }
    if (answer?.ok !== false) return;
    refusals += 1;
    issues = automationStudioActivityIssuesOf(answer.diagnostics);
    const diagnostics = record(answer.diagnostics);
    const named = [diagnostics?.refusal, ...(Array.isArray(diagnostics?.refusals) ? diagnostics.refusals : []), diagnostics?.code].find((code): code is string => typeof code === "string" && code.length > 0);
    family = named;
  };
  return {
    observe: (loop) => ({
      ...loop,
      executeTool: async (call) => {
        const result = await loop.executeTool.call(loop, call);
        if (call.toolId === submitToolId) noted(result);
        return result;
      }
    }),
    codes: (stall) => {
      let sentAgain = 0;
      for (const row of stall.trace) {
        if (row.toolId !== submitToolId) continue;
        sentAgain = row.resultCode !== undefined && SENT_AGAIN.has(row.resultCode) ? sentAgain + 1 : 0;
      }
      return automationStudioCandidateRefusalCodes.encode({ refusals, sentAgain, family, issues });
    }
  };
}
