// The one door a model's Flow build comes through.
//
// It takes whatever the provider returned -- a Flow script as text, a reply
// carrying one under `flow`, or the nested JSON plan that was the only shape
// before -- and returns one canonical plan, or the issues that refused it.
// Normalisation happens here and nowhere else, so there is one account of what
// is accepted, and nothing after it is loosened: the plan this returns still
// goes through `parseAutomationStudioFlowBootstrapPlan` and
// `validateAutomationStudioFlowBootstrapPlan` exactly as before, and a plan
// that cannot pass them is still refused and still creates nothing.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowBootstrapAcceptance } from "./contracts.ts";
import { normaliseAutomationStudioFlowBootstrapJsonPlan } from "./json-plan.ts";
import { authoringKey } from "./keys.ts";
import { parseAutomationStudioFlowScript } from "./parse.ts";
import { isJsonObject } from "./values.ts";

/** Keys a reply may carry a Flow script under. */
const SCRIPT_KEYS = new Set(["flow", "script", "steps", "lines", "text", "body", "plan"]);
/** Keys a reply may carry a nested JSON plan under. */
const PLAN_KEYS = ["plan", "flow", "result"];

export function acceptAutomationStudioFlowBootstrapResult(input: {
  result: JsonValue;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapAcceptance {
  const script = scriptText(input.result);
  const stated = statedSummary(input.result);
  if (script !== undefined) {
    const read = parseAutomationStudioFlowScript(script);
    const summary = boundedSummary(stated ?? read.script.summary ?? read.script.blocks[0]?.steps[0]?.description);
    const assembled = assembleAutomationStudioFlowScriptPlan({ script: read.script, registry: input.registry, resolution: input.resolution, summary });
    const issues = [...read.issues, ...assembled.issues];
    if (assembled.plan) return { ok: true, summary, plan: assembled.plan, issues, script };
    return { ok: false, issues, ...(assembled.refusedPlan ? { refusedPlan: assembled.refusedPlan } : {}), script };
  }
  const written = planValue(input.result);
  const summary = boundedSummary(stated);
  const normalised = normaliseAutomationStudioFlowBootstrapJsonPlan({ value: written, registry: input.registry, resolution: input.resolution, summary });
  return normalised.plan
    ? { ok: true, summary, plan: normalised.plan, issues: normalised.issues }
    : { ok: false, issues: normalised.issues };
}

/** The Flow script a result carries, however it carried it. */
function scriptText(result: JsonValue): string | undefined {
  if (typeof result === "string") return result.trim() || undefined;
  if (Array.isArray(result)) return joinedLines(result);
  if (!isJsonObject(result)) return undefined;
  for (const [key, value] of Object.entries(result)) {
    if (!SCRIPT_KEYS.has(authoringKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value;
    const joined = Array.isArray(value) ? joinedLines(value) : undefined;
    if (joined) return joined;
  }
  return undefined;
}

function joinedLines(value: readonly JsonValue[]): string | undefined {
  if (!value.length || !value.every((line) => typeof line === "string")) return undefined;
  const joined = (value as string[]).join("\n").trim();
  return joined || undefined;
}

function planValue(result: JsonValue): JsonValue {
  if (!isJsonObject(result)) return result;
  for (const key of PLAN_KEYS) if (isJsonObject(result[key])) return result[key];
  return result;
}

function statedSummary(result: JsonValue): string | undefined {
  if (!isJsonObject(result)) return undefined;
  for (const [key, value] of Object.entries(result)) {
    if (authoringKey(key) !== "summary" || typeof value !== "string" || !value.trim()) continue;
    return value;
  }
  return undefined;
}

function boundedSummary(text: string | undefined): string {
  const trimmed = (text ?? "").replace(/\s+/gu, " ").trim();
  return (trimmed || "Flow built from the instruction.").slice(0, AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxSummaryLength);
}
