// What an attempt already tried, carried across fresh rounds so the same thing is not simply
// done again (plan, D14), in the contract's own content-free words: a digest, Core's tool id
// and how it came out, never a row, a typed value or a page's text.
//
// **A stand-in until t859 merges.** Loop detection's `attemptRecord` is the real source of this
// record, and its `data()` is assignable to the same contract (`tried-record.ts`). Until then
// this notes the calls that failed or changed nothing, as the chain sees them, and the lane's
// supervisor swaps it for that record when the two meet. Amendments are not seen here.

import { createHash } from "node:crypto";
import type { AutomationStudioTriedEntry, AutomationStudioTriedOutcome, AutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";

/** The call's own free words, which do not make it another call (t859, `meaningful-input.ts`). */
const FREE_WORDS = new Set(["reason", "summary", "why", "note"]);

export class AutomationStudioAnswerFirstTriedLog {
  private readonly entries = new Map<string, AutomationStudioTriedEntry>();
  private approaches = 0;

  constructor(seed?: AutomationStudioTriedRecord) {
    for (const entry of seed?.tried ?? []) this.entries.set(entry.key, structuredClone(entry) as AutomationStudioTriedEntry);
    this.approaches = seed?.approaches ?? 0;
  }

  /** One call's answer: kept only when it failed or changed nothing. */
  note(call: { toolId: string; value: JsonObject }, answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): void {
    const outcome = outcomeOf(answer);
    if (!outcome) return;
    const key = `sha256:${createHash("sha256").update(`${call.toolId}\n${stable(call.value)}`).digest("hex")}`;
    const known = this.entries.get(key);
    this.entries.set(key, { kind: "call", key, toolId: call.toolId, outcome, times: (known?.times ?? 0) + 1 });
  }

  /** A fresh approach began. */
  freshRound(): void {
    this.approaches += 1;
  }

  data(): AutomationStudioTriedRecord {
    return { version: 1, tried: [...this.entries.values()].map((entry) => ({ ...entry })), approaches: this.approaches };
  }

  /** What a fresh round is told: which tool, how it came out, how often. */
  forModel(): JsonObject {
    return { calls: [...this.entries.values()].slice(-40).map((entry) => ({ toolId: entry.toolId, outcome: entry.outcome, times: entry.times })), freshStarts: this.approaches };
  }
}

function outcomeOf(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): AutomationStudioTriedOutcome | undefined {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer) || answer.kind !== "llm_evidence_tool_execution") return undefined;
  const execution = answer as AutomationStudioLlmEvidenceToolExecutionResult;
  const evidence = execution.evidence;
  const refused = typeof evidence === "object" && evidence !== null && !Array.isArray(evidence) && evidence.ok === false;
  if (refused || execution.failure !== undefined) return "failed";
  return execution.draft?.effect === "mutate" && execution.effectApplied === false ? "changed_nothing" : undefined;
}

function stable(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const members = Object.keys(value).filter((key) => !FREE_WORDS.has(key)).sort();
  return `{${members.map((key) => `${JSON.stringify(key)}:${stable(value[key]!)}`).join(",")}}`;
}
