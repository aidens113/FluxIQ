import { automationStudioFlowBootstrapIssuePlace, type AutomationStudioFlowBootstrapIssueLocator } from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

/**
 * A candidate refused for its loops or bindings, for a step that answers an
 * interruption through its offer (`../script-statements/way-out-steps.ts`), or
 * for an optional step that does a requested act
 * (`../instructed-acts/optional-act-steps.ts`), under `code`. Every sentence is Core's own
 * (`../authoring/`, `../script-statements/`) and quotes only node keys, labels,
 * field names and output ids the model wrote -- and, for the way out, the words
 * of the control its step names, which the evidence already printed to it --
 * so each travels whole with its code and path, and with
 * the step it is about as the model wrote it (t378): a node key such as "s11"
 * is Core's, and names no step the model can find in its script.
 */
export function bindingRefusal(issues: readonly AutomationStudioFlowBootstrapIssue[], locator: AutomationStudioFlowBootstrapIssueLocator | undefined, code: string): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  return {
    ok: false,
    issueCodes: [...new Set(issues.map((issue) => issue.code))],
    feedback: {
      ok: false,
      code,
      issues: issues.map((issue) => {
        const place = automationStudioFlowBootstrapIssuePlace(locator, issue.path);
        return {
          code: issue.code,
          ...(issue.path ? { path: issue.path } : {}),
          message: issue.message,
          ...(place ? { step: place.step, ...(place.label === undefined ? {} : { label: place.label }), ...(place.line === undefined ? {} : { line: place.line }) } : {})
        };
      }),
      instruction: "Each issue names the step it is about, by its line where the script has one. Correct every one and resubmit the entire candidate."
    }
  };
}
