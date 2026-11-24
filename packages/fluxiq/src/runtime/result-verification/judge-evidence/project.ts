import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../llm/harness-options/index.ts";
import { automationStudioJudgeEvidenceIsCoreCall } from "./core-call.ts";
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
 */
export function automationStudioProjectJudgeEvidence(input: Input, projector: AutomationStudioJudgeEvidenceProjector | undefined, deniedKeys: readonly string[] | undefined): AutomationStudioJudgeEvidenceProjection {
  if (automationStudioJudgeEvidenceIsCoreCall(input.definitionId)) return { role: "observation", evidence: {}, missing: [], withheld: false };
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
