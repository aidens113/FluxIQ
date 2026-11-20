// t859's attempt record, as the contract's `AutomationStudioTriedRecord`, which is what the attempt
// row carries (`@fluxiq/contracts/automation`, `tried-record.ts`, which says this side states the
// assignment when the two meet). The members are the same, `same_act` included, with the models the
// attempt used and why it climbed (`ladder`) and the model's decisions about repeats it was told of
// (`decisions`, t962), so a Lab report reads them off the row. What the last stopped loop repeated
// (`stoppedOn`) is for the next round only and stays off the row.

import type { AutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { AutomationStudioLlmLoopAttemptRecordData } from "../../../../../runtime/llm/repeat-guard/index.ts";
import { automationStudioAnswerFirstLoopPattern } from "./loops-caught.ts";

export function automationStudioAnswerFirstTriedAsContract(data: AutomationStudioLlmLoopAttemptRecordData): AutomationStudioTriedRecord {
  return {
    version: data.version,
    approaches: data.approaches,
    tried: data.tried.map(({ pattern, changes, ...entry }) => ({
      ...entry,
      ...(pattern ? { pattern: automationStudioAnswerFirstLoopPattern(pattern) } : {}),
      ...(changes ? { changes: changes.map((change) => ({ ...change })) } : {})
    })),
    ...(data.ladder ? {
      ladder: {
        base: data.ladder.base,
        escalations: data.ladder.escalations.map(({ pattern, ...escalation }) => ({ ...escalation, ...(pattern ? { pattern: automationStudioAnswerFirstLoopPattern(pattern) } : {}) }))
      }
    } : {}),
    ...(data.decisions?.length ? { decisions: data.decisions.map(({ pattern, ...decided }) => ({ ...decided, ...(pattern ? { pattern: automationStudioAnswerFirstLoopPattern(pattern) } : {}) })) } : {})
  } satisfies AutomationStudioTriedRecord;
}
