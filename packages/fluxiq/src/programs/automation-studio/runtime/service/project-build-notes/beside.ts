import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";

// Core's own words beside a tool's answer (`../project-build/brief-ports.ts`, `./told.ts`):
// the domain's evidence is kept whole, and Core's note is added under its own
// key beside it, never in its place.

type Ran = Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>;

/** `ran` with Core's `key` added beside its evidence: in the evidence object, or holding a non-object evidence under `evidence`. */
export function automationStudioProjectBuildEvidenceBeside(ran: Ran, key: string, value: JsonObject): Ran {
  if (!isExecution(ran)) return ran;
  const evidence = isObject(ran.evidence) ? { ...ran.evidence, [key]: value } : { [key]: value, evidence: ran.evidence };
  return { ...ran, evidence };
}

function isExecution(ran: Ran): ran is AutomationStudioLlmEvidenceToolExecutionResult {
  return isObject(ran) && ran.kind === "llm_evidence_tool_execution";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
