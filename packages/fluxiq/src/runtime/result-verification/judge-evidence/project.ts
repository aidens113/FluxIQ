import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../llm/harness-options/index.ts";
import { automationStudioJudgeEvidenceIsCoreCall } from "./core-call.ts";
import { automationStudioJudgeEarlierBeforeNote, type AutomationStudioJudgeEarlierBeforeNote } from "./earlier-before-note.ts";
import { automationStudioJudgeEvidenceResponse } from "./response.ts";

type Input = Parameters<AutomationStudioJudgeEvidenceProjector>[0];
type Role = ReturnType<AutomationStudioJudgeEvidenceProjector>["role"];
export type AutomationStudioJudgeEvidenceProjection = {
  role?: Role;
  evidence?: JsonValue;
  missing: string[];
  withheld: boolean;
};

/**
 * Project only host-declared semantic facts; unavailable or malformed projection never falls back to raw evidence.
 * Core's own tools are never handed to the host: an observation of no host facts and no gap (`./core-call.ts`, t1032).
 * Nor is Core's own note on a before side it holds no reading from before for (`./earlier-before-note.ts`, t1043): the
 * judge is told it in Core's words, and only a reading beside it goes to the host.
 */
export function automationStudioProjectJudgeEvidence(input: Input, projector: AutomationStudioJudgeEvidenceProjector | undefined, deniedKeys: readonly string[] | undefined): AutomationStudioJudgeEvidenceProjection {
  if (automationStudioJudgeEvidenceIsCoreCall(input.definitionId)) return { role: "observation", evidence: {}, missing: [], withheld: false };
  const note = input.source === "state" ? automationStudioJudgeEarlierBeforeNote(heldValue(input.evidence)) : undefined;
  if (note !== undefined) return earlierBefore(note, input, projector, deniedKeys);
  if (projector === undefined) return missing("judge_evidence.projector_missing");
  if (deniedKeys === undefined) return missing("judge_evidence.denied_keys_missing");
  let response: unknown;
  try {
    const copy = structuredClone(input);
    freeze(copy);
    response = structuredClone(projector(copy));
  } catch {
    return missing("judge_evidence.projection_failed");
  }
  return automationStudioJudgeEvidenceResponse(response, deniedKeys);
}

/** Core's note in its own words, and the reading beside it, where there is one, projected by the host as page state. */
function earlierBefore(note: AutomationStudioJudgeEarlierBeforeNote, input: Input, projector: AutomationStudioJudgeEvidenceProjector | undefined, deniedKeys: readonly string[] | undefined): AutomationStudioJudgeEvidenceProjection {
  if (deniedKeys === undefined) return missing("judge_evidence.denied_keys_missing");
  const reading = note.reading === undefined ? undefined : automationStudioProjectJudgeEvidence({ ...input, evidence: { evidence: note.reading } }, projector, deniedKeys);
  const shown = automationStudioJudgeEvidenceResponse({
    role: reading?.role ?? "observation",
    evidence: { note: note.note, ...(reading?.evidence === undefined ? {} : { reading: reading.evidence }) },
    missing: reading?.missing ?? []
  }, deniedKeys);
  return { ...shown, withheld: shown.withheld || reading?.withheld === true };
}

/** The value a state input carries: callers wrap it as `{ evidence: value }`. */
function heldValue(evidence: JsonValue): JsonValue | undefined {
  return evidence !== null && typeof evidence === "object" && !Array.isArray(evidence) ? evidence.evidence : undefined;
}

function missing(code: string): AutomationStudioJudgeEvidenceProjection {
  return { missing: [code], withheld: true };
}

/** Freeze a private copy iteratively, including nested rows, without a depth/item limit. */
function freeze(value: object): void {
  const seen = new Set<object>();
  const pending = [value];
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (seen.has(item)) continue;
    seen.add(item);
    for (const child of Object.values(item)) if (child !== null && typeof child === "object") pending.push(child);
    Object.freeze(item);
  }
}
