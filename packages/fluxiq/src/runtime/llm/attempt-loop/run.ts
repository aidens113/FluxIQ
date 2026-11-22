// Every round shares attempt identity and tried-work history, while keeping the same starting model.
import type { AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import { automationStudioLlmLoopDecisionOffered } from "../loop-decision/index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../repeat-guard/index.ts";
import { automationStudioLlmModelLadderFrame, runWithAutomationStudioLlmModelLadder } from "../role-routing/index.ts";

type Loop = (input: AutomationStudioLlmEvidenceLoopInput) => Promise<AutomationStudioLlmEvidenceLoopResult>;

export async function automationStudioLlmEvidenceLoopInAttempt(given: AutomationStudioLlmEvidenceLoopInput, loop: Loop): Promise<AutomationStudioLlmEvidenceLoopResult> {
  const enclosing = automationStudioLlmModelLadderFrame();
  const record = given.attemptRecord ?? automationStudioLlmLoopAttemptRecord(undefined, enclosing ? { ladder: enclosing } : undefined);
  const input = automationStudioLlmLoopDecisionOffered({ ...given, attemptRecord: record });
  return await runWithAutomationStudioLlmModelLadder(record.ladder, async () => await loop(input));
}
