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
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../../framework/automation-service/nodes/index.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../answerability/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowBootstrapAcceptance } from "./contracts.ts";
import { normaliseAutomationStudioFlowBootstrapJsonPlan } from "./json-plan.ts";
import { authoringKey } from "./keys.ts";
import type { AuthoringPartOfStep } from "../record-defaults/index.ts";
import { parseAutomationStudioFlowScript } from "./parse.ts";
import { automationStudioFlowBootstrapPlanLocator } from "./plan-locator.ts";
import { automationStudioFlowScriptLocator } from "./script-locator.ts";
import { authoringNestedValue, authoringSetAtPath, isJsonObject } from "./values.ts";
import { authoringNodeList, readAuthoringPlanSubflows } from "./plan-shapes.ts";
import { automationStudioAuthoredProcessingIssue } from "../../draft/index.ts";
import { authoringError } from "./issue.ts";

/** Keys a reply may carry a Flow script under. */
const SCRIPT_KEYS = new Set(["flow", "script", "steps", "lines", "text", "body", "plan"]);
/** Keys a reply may carry a nested JSON plan under. */
const PLAN_KEYS = ["plan", "flow", "result"];

export function acceptAutomationStudioFlowBootstrapResult(input: {
  result: JsonValue;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /**
   * The active instructions' own words, as the build read them. The columns
   * they name are declared as the schema of every extraction whose author
   * declared none (`./instruction-record-columns.ts`); absent, nothing is.
   */
  instructionText?: string | undefined;
  /** Which plan part a step serves (`./part/answer.ts`); a record output the model left parts out of is derived from it. */
  partOf?: AuthoringPartOfStep | undefined;
}): AutomationStudioFlowBootstrapAcceptance {
  const namedColumns = automationStudioFlowBootstrapInstructionColumns(input.instructionText ?? "");
  const script = scriptText(input.result);
  const stated = statedSummary(input.result);
  if (script !== undefined) {
    const read = parseAutomationStudioFlowScript(script);
    for (const block of read.script.blocks) for (const step of block.steps) {
      const parameters: JsonObject = {};
      for (const entry of step.entries) {
        const path = entry.key.split(".");
        if (authoringKey(path[0] ?? "") !== "recordoutput") continue;
        authoringSetAtPath(parameters, ["recordOutput", ...path.slice(1)], authoringNestedValue(entry.lines.join("\n")));
      }
      const issue = automationStudioAuthoredProcessingIssue(parameters);
      // Refused before assembly, so nothing is built to place it by; the script's own lines name the step it is in (`./script-locator.ts`).
      if (issue) return { ok: false, script, issues: [processingRefusal(issue, `flow.line.${step.line}`)], locator: automationStudioFlowScriptLocator({ script: read.script, subflows: [], unplaced: [], rules: [], fallback: undefined }) };
    }
    const summary = boundedSummary(stated ?? read.script.summary ?? read.script.blocks[0]?.steps[0]?.description);
    const assembled = assembleAutomationStudioFlowScriptPlan({ script: read.script, registry: input.registry, resolution: input.resolution, summary, namedColumns, partOf: input.partOf });
    const issues = [...read.issues, ...assembled.issues];
    const processingIssue = assembled.plan?.subflows.flatMap((flow) => flow.nodes).map((node) => automationStudioAuthoredProcessingIssue(node.parameters)).find((issue) => issue === "record_output.process_declaration_framework_owned");
    if (processingIssue) return { ok: false, script, issues: [...issues, processingRefusal(processingIssue, "plan")] };
    // Where each refusal from here on is in the script (`./script-locator.ts`).
    const located = assembled.locator ? { locator: assembled.locator } : {};
    if (assembled.plan) return { ok: true, summary, plan: assembled.plan, issues, script, ...located };
    return { ok: false, issues, ...(assembled.refusedPlan ? { refusedPlan: assembled.refusedPlan } : {}), script, ...located };
  }
  const written = planValue(input.result);
  const raw = readAuthoringPlanSubflows(written);
  if (!("refusal" in raw)) for (const flow of raw.subflows) for (const node of authoringNodeList(flow.written) ?? []) {
    const issue = automationStudioAuthoredProcessingIssue(node);
    if (issue) return { ok: false, issues: [processingRefusal(issue, "plan")] };
  }
  const summary = boundedSummary(stated);
  const normalised = normaliseAutomationStudioFlowBootstrapJsonPlan({ value: written, registry: input.registry, resolution: input.resolution, summary, namedColumns, partOf: input.partOf });
  const processingIssue = normalised.plan?.subflows.flatMap((flow) => flow.nodes).map((node) => automationStudioAuthoredProcessingIssue(node.parameters)).find((issue) => issue === "record_output.process_declaration_framework_owned");
  if (processingIssue) return { ok: false, issues: [...normalised.issues, processingRefusal(processingIssue, "plan")] };
  // A JSON plan has no lines: a refusal names the node by its name and key (`./plan-locator.ts`).
  return normalised.plan
    ? { ok: true, summary, plan: normalised.plan, issues: normalised.issues, locator: automationStudioFlowBootstrapPlanLocator(normalised.plan, written) }
    : { ok: false, issues: normalised.issues, locator: automationStudioFlowBootstrapPlanLocator(written) };
}

function processingRefusal(code: string, path: string) {
  return authoringError(code, "Processing provenance belongs to the framework. Bind only explicit caller $input values; raw state, row and step bindings cannot declare task criteria.", path);
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
