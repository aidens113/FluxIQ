// A refusal made before any model call, as the answer-first path returns it (plan, "Keep Going
// Until The Result"): a normal `status: "setup_needed"` that says what to do, with no attempt
// started. No failure is reported, because no task was tried. A code the table does not answer
// for, and a person's Stop, go on as they were thrown.
//
// **The return is not in the build's result union**, which this lane does not own and which a
// caller reads field by field. It travels under that type and `automationStudioAnswerFirstSetupOf`
// reads it back. What must change outside to carry it to the chat is in
// `docs/working/answer-first-plan/reports/exploration-path/endings.md`.

import { automationStudioAnswerFirstPreModelStep } from "../../../../../runtime/answer-first/pre-model/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../../../runtime/flow-authoring/bootstrap/generation-failure/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstSay } from "../attempt/index.ts";

const TITLE = "Before I can start";

/** What the person is told to do, and the code it came from, for a reader of the record. */
export type AutomationStudioAnswerFirstSetupNeeded = {
  projectId: string;
  flowId: string;
  status: "setup_needed";
  code: string;
  say: string;
};

/** The setup step for a refusal the table answers for, said in the chat; anything else thrown again (header). */
export function automationStudioAnswerFirstSetupOnRefusal(request: { projectId: string; flowId: string }, error: unknown): AutomationStudioGenerateFlowBootstrapAdaptationResult {
  const code = (error as { name?: unknown } | null)?.name === "AbortError" ? undefined : parseAutomationStudioFlowBootstrapGenerationError(error)?.code;
  const step = code === undefined ? undefined : automationStudioAnswerFirstPreModelStep(code);
  if (code === undefined || !step) throw error;
  automationStudioAnswerFirstSay(TITLE, step.say);
  const needed: AutomationStudioAnswerFirstSetupNeeded = { projectId: request.projectId, flowId: request.flowId, status: "setup_needed", code, say: step.say };
  return needed as unknown as AutomationStudioGenerateFlowBootstrapAdaptationResult;
}

/** The setup step a build's result is, or nothing. */
export function automationStudioAnswerFirstSetupOf(result: unknown): AutomationStudioAnswerFirstSetupNeeded | undefined {
  return (result as { status?: unknown } | null)?.status === "setup_needed" ? result as AutomationStudioAnswerFirstSetupNeeded : undefined;
}
