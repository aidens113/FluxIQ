// One subflow test as a builder answers it (`../subflow-candidate/builder-loop.ts`): a
// `core.test_subflow` call, or the test a `core.submit_subflow` call folds in
// with `then` (t811, `./submit-then.ts`). Both go the same way, so a folded test
// is answered exactly as the tool would answer it: the gate's test
// (`../subflow-candidate/subflow-trial-gate.ts`); the candidate loop's trial view, which adds the
// page the test left where it ran or its checks moved the tab (t738,
// `../candidate/trial-view.ts`); and the builder's memory of its trials' advice
// (t741 D, `../subflow-candidate/repeated-advice.ts`). The trial it ran, where it ran one, is
// handed back for the builder's own bookkeeping (`tried`, `lastTrial`); a
// refused call and a run from a step ran none.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import { automationStudioCandidateTrialView } from "../candidate/index.ts";
import type { AutomationStudioSubflowRepeatedAdvice, AutomationStudioSubflowTrialGate, AutomationStudioSubflowTrialResult } from "../subflow-candidate/index.ts";

/** Tests `value` through `gate` and answers it as `core.test_subflow` does (header); `trial`, the partial verdict it ran, if any. */
export async function automationStudioSubflowBuilderTest(input: {
  gate: AutomationStudioSubflowTrialGate;
  advice: AutomationStudioSubflowRepeatedAdvice;
  value: JsonObject;
  /** The call the test answers, which names the look the trial view makes. */
  callId: string;
  signal?: AbortSignal | undefined;
  /** How many times the reset's start check has moved the target (t738). */
  moves?: (() => number) | undefined;
  tools: readonly AutomationStudioLlmEvidenceTool[];
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
}): Promise<{ answered: AutomationStudioLlmEvidenceToolExecutionResult; trial?: AutomationStudioSubflowTrialResult | undefined }> {
  const { gate, moves } = input;
  const before = moves?.();
  const tested = await gate.test(input.value, input.signal);
  const targetMoved = before !== undefined && moves!() > before;
  const viewed = await automationStudioCandidateTrialView({ answer: tested, targetMoved, tools: input.tools, executeTool: input.executeTool, callId: input.callId, signal: input.signal });
  // A judged no's advice less what an earlier trial's advice already said (t741 D).
  const answered = input.advice.told(viewed);
  return { answered, trial: answeredTrial(answered, gate) };
}

/** The partial verdict a test call answered, when it ran a trial: a refused call (wrong receipt, retest limit) or a run from a step ran none. */
function answeredTrial(answered: AutomationStudioLlmEvidenceToolExecutionResult, gate: AutomationStudioSubflowTrialGate): AutomationStudioSubflowTrialResult | undefined {
  const evidence = answered.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || evidence.partial !== true) return undefined;
  const { revision, digest } = evidence;
  return typeof revision === "number" && typeof digest === "string" ? gate.standing({ revision, digest }) : undefined;
}
