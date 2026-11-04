// The act record a carried-on attempt goes on with: its own, or nothing at all. The task's memory
// holds it through anything else that happens on the Flow; the Flow's record is this attempt's only
// where this attempt is the Flow's latest. An attempt that shows acts and has no record left to
// hold them is refused: reading what must not be done again as nothing is the one wrong answer.

import { parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioAnswerFirstAttemptRecord } from "../attempt-store/index.ts";
import type { AutomationStudioAnswerFirstRunActStore } from "../run-acts/index.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "../task-memory/index.ts";

type Where = { projectId: string; flowId: string; attemptId: string; before: AutomationStudioAnswerFirstAttemptRecord; latestOnFlow: boolean };

/** The record, nothing where the attempt never acted, or `unreadable`. A record that cannot be read throws, for the caller to refuse. */
export async function automationStudioAnswerFirstAttemptActs(kept: AutomationStudioAnswerFirstTaskMemory | undefined, acts: Pick<AutomationStudioAnswerFirstRunActStore, "get">, where: Where): Promise<AutomationStudioAttemptActRecordData | undefined | "unreadable"> {
  if (kept?.acts?.attemptId === where.attemptId) return kept.acts.data;
  const flows = where.latestOnFlow ? await acts.get(where.projectId, where.flowId) : undefined;
  if (flows && parseAutomationStudioAttemptActRecordData(flows).ok) return flows;
  return where.before.result?.acts.length ? "unreadable" : undefined;
}
