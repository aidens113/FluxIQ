// The one evidence entry a batch comes back as.
//
// A turn that ran several actions reports them together: each action's
// outcome in order, and under `latest` the evidence as it stands after the
// last action that ran -- for a page, the page as it now is. It is one entry
// rather than one per action because every mutating action of a web domain
// recaptures the page, and eleven captures of one form, each a few thousand
// bytes, would either overflow the context window or push out the evidence
// the model still needs. So an earlier action's value is carried only when it
// adds something the latest one does not: an observation's finding, or the
// last full state before a refusal. Anything else is marked superseded, and
// anything that does not fit is marked so rather than silently dropped.
//
// The entry is held to `maxBytes`, which the loop sets to what one tool result
// may occupy in the window. The loop also hands every action of the batch a
// cap that leaves room for the outcome lines (`automationStudioLlmEvidenceBatchReserve`),
// so the latest value and the lines fit together.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_STOPS, isAutomationStudioLlmEvidenceRefusal, type AutomationStudioLlmEvidenceBatchStop } from "./stop.ts";

/** The evidence entry a batch's packet arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_TOOL_ID = "core.batch_result";

/** What became of one listed action. */
export type AutomationStudioLlmEvidenceBatchOutcome =
  | { toolId: string; status: "ran"; callId: string; effect: "observe" | "mutate" | undefined; evidence: JsonValue; effectApplied: boolean; resultCode?: string }
  | { toolId: string; status: "answered"; code: string; answeredByCallId: string }
  | { toolId: string; status: "not_run" };

/** Bytes an outcome line may need beside its ids: status, result code, flags and punctuation. */
const LINE_OVERHEAD_BYTES = 200;
/** Bytes the packet needs around its lines: its version, the stop and its sentence, and the `latest` wrapper. */
const ENVELOPE_BYTES = 800;

/**
 * Room a batch's outcome lines and envelope may take, from the tool and call
 * ids it will carry. What is left of the window is what each action's own
 * evidence may use.
 */
export function automationStudioLlmEvidenceBatchReserve(lines: ReadonlyArray<{ toolId: string; callId?: string }>): number {
  return ENVELOPE_BYTES + lines.reduce((sum, line) => sum + line.toolId.length + (line.callId?.length ?? 16) + 8 + LINE_OVERHEAD_BYTES, 0);
}

/** The packet: every outcome in order, the stop if there was one, and the latest evidence, within `maxBytes` where it can be. */
export function automationStudioLlmEvidenceBatchPacket(input: {
  outcomes: readonly AutomationStudioLlmEvidenceBatchOutcome[];
  /** Position (1-based) of the action after which the batch stopped, and why. */
  stop?: { after: number; reason: AutomationStudioLlmEvidenceBatchStop };
  maxBytes: number;
}): JsonObject {
  const ran = input.outcomes.flatMap((outcome, index) => outcome.status === "ran" ? [{ outcome, index }] : []);
  const latest = ran.at(-1);
  // Earlier values worth their bytes, newest first: the newest one that is not
  // a refusal (the state before a refused last action), and any observation.
  const wanted = new Set<number>();
  let fullStateKept = latest !== undefined && !refused(latest.outcome.evidence);
  for (const { outcome, index } of ran.slice(0, -1).reverse()) {
    if (!fullStateKept && !refused(outcome.evidence)) {
      wanted.add(index);
      fullStateKept = true;
    } else if (outcome.effect === "observe" && !refused(outcome.evidence)) wanted.add(index);
  }
  const lines: JsonObject[] = input.outcomes.map((outcome, index) => line(outcome, index, latest?.index));
  const packet: JsonObject = {
    schemaVersion: "automation-studio.evidence-batch.v1",
    actions: lines,
    ...(input.stop ? { stopped: { after: input.stop.after, code: `llm_evidence_loop.batch.${input.stop.reason}`, instruction: AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_STOPS[input.stop.reason] } } : {}),
    ...(latest ? { latest: { callId: latest.outcome.callId, toolId: latest.outcome.toolId, value: latest.outcome.evidence } } : {})
  };
  let bytes = byteLength(packet);
  for (const index of [...wanted].sort((left, right) => right - left)) {
    const outcome = input.outcomes[index] as Extract<AutomationStudioLlmEvidenceBatchOutcome, { status: "ran" }>;
    const withValue: JsonObject = { ...withoutOmission(lines[index]!), value: outcome.evidence };
    const added = byteLength(withValue) - byteLength(lines[index]!);
    if (bytes + added > input.maxBytes) {
      lines[index] = { ...lines[index]!, valueOmitted: "size" };
      continue;
    }
    lines[index] = withValue;
    bytes += added;
  }
  return packet;
}

function line(outcome: AutomationStudioLlmEvidenceBatchOutcome, index: number, latestIndex: number | undefined): JsonObject {
  const head = { n: index + 1, toolId: outcome.toolId, status: outcome.status };
  if (outcome.status === "not_run") return head;
  if (outcome.status === "answered") return { ...head, code: outcome.code, answeredByCallId: outcome.answeredByCallId };
  return {
    ...head,
    callId: outcome.callId,
    ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}),
    ...(outcome.effect === "mutate" ? { effectApplied: outcome.effectApplied } : {}),
    // The latest value is carried once, under `latest`; every other one is
    // superseded until the size pass decides to carry it here.
    ...(index === latestIndex ? { valueIn: "latest" } : { valueOmitted: "superseded" })
  };
}

function withoutOmission(value: JsonObject): JsonObject {
  const { valueOmitted: _omitted, ...rest } = value;
  return rest;
}

function refused(evidence: JsonValue): boolean {
  return isAutomationStudioLlmEvidenceRefusal(evidence);
}

function byteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

