// Why a loop refused its configuration, by name (t584).
//
// A loop that cannot run on what it was given ends before its first call as
// `llm_evidence_loop.invalid_configuration`. That code used to be all it said:
// on A8 launch 6 an everything-store builder came back blocked with that code,
// 0 calls, twice, and nothing in the run said which of a dozen checks had
// failed. It was the submit tool's description, grown past the 2,000 characters
// a tool may describe itself in once its brief carried two parts and an output
// line (`../../flow-bootstrap/subflow-candidate/builder-loop.ts`). So a refused
// configuration now carries the check that failed, the figures it was held to,
// and one sentence saying it, in the loop's result (`../evidence-loop/result.ts`) and from
// there in a brief's return.
//
// The limit checks name themselves where they are made
// (`../loop-configuration.ts`, `resolveLimits`). The tool set's checks are
// `automationStudioLlmEvidenceValidTools` (`../evidence-loop-decision.ts`),
// which answers yes or no; this module names the first one a refused set
// fails, in the same order, and a test holds the two to the same verdicts
// (`./tests/issue.test.ts`). A set that check refuses for a
// reason not named here is said as `tools.invalid`, never as nothing.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";

/** The most tools one loop may offer (`../evidence-loop-decision.ts`, `automationStudioLlmEvidenceValidTools`). */
const MAX_TOOLS = 32;
/** The most characters a tool may describe itself in, there and in the provider's preflight (`../deepseek/preflight.ts`). */
const MAX_DESCRIPTION = 2_000;
const TOOL_ID = /^[a-z0-9_.:-]{1,200}$/i;
const ACTION_INPUT_KEY = /^[a-z][a-z0-9_]{0,63}$/i;

/** One refused configuration: the check, its figures, and a sentence. */
export type AutomationStudioLlmEvidenceLoopConfigurationIssue = {
  /** The check that failed, e.g. `limits.max_tool_calls` or `tool.description_length`. */
  check: string;
  /** The figures it was held to, by name; a value that is not a finite number is said as text. */
  values: JsonObject;
  /** What failed, in one sentence. */
  words: string;
};

/** The first check a refused tool set fails (header). */
export function automationStudioLlmEvidenceLoopToolSetIssue(tools: unknown): AutomationStudioLlmEvidenceLoopConfigurationIssue {
  if (!Array.isArray(tools) || !tools.length) return issue("tools.none", { count: Array.isArray(tools) ? 0 : said(tools) }, "The loop was given no tools.");
  if (tools.length > MAX_TOOLS) return issue("tools.too_many", { count: tools.length, max: MAX_TOOLS }, `The loop was given ${tools.length} tools; at most ${MAX_TOOLS} may be offered.`);
  const ids = new Set<string>();
  for (const [index, tool] of (tools as unknown[]).entries()) {
    const found = toolIssue(tool, index, ids);
    if (found) return found;
  }
  const opening = (tools as AutomationStudioLlmEvidenceTool[]).filter((tool) => tool.initialObservation !== undefined).map((tool) => tool.toolId);
  if (opening.length > 1) return issue("tools.initial_observations", { toolIds: opening }, `${opening.length} tools declare an opening look (${opening.join(", ")}); at most one may.`);
  const repeating = (tools as AutomationStudioLlmEvidenceTool[]).filter((tool) => tool.repeatPolicy === "after_mutation").map((tool) => tool.toolId);
  if (repeating.length && !(tools as AutomationStudioLlmEvidenceTool[]).some((tool) => tool.effect === "mutate")) {
    return issue("tools.repeat_policy_without_mutation", { toolIds: repeating }, `${repeating.join(", ")} may repeat after a change, but no tool of the set makes one.`);
  }
  return issue("tools.invalid", { count: tools.length }, "The tool set was refused by a check this diagnosis does not name.");
}

function toolIssue(value: unknown, index: number, ids: Set<string>): AutomationStudioLlmEvidenceLoopConfigurationIssue | undefined {
  if (!isRecord(value)) return issue("tool.shape", { index }, `Tool ${index} is not an object.`);
  const tool = value as Partial<AutomationStudioLlmEvidenceTool>;
  if (typeof tool.toolId !== "string" || !TOOL_ID.test(tool.toolId)) return issue("tool.id", { index, toolId: said(tool.toolId) }, `Tool ${index}'s id is not a valid tool id.`);
  const toolId = tool.toolId;
  if (ids.has(toolId)) return issue("tool.duplicate_id", { index, toolId }, `${toolId} is offered twice.`);
  ids.add(toolId);
  const length = typeof tool.description === "string" ? tool.description.length : said(tool.description);
  if (typeof tool.description !== "string" || !tool.description.length || tool.description.length > MAX_DESCRIPTION) {
    return issue("tool.description_length", { toolId, length, max: MAX_DESCRIPTION }, `${toolId}'s description is ${typeof length === "number" ? `${length} characters` : "not text"}; a tool's description must be 1 to ${MAX_DESCRIPTION} characters.`);
  }
  if (!isJsonObject(tool.inputSchema)) return issue("tool.input_schema", { toolId }, `${toolId}'s input schema is not a JSON object.`);
  if (tool.effect !== undefined && tool.effect !== "observe" && tool.effect !== "mutate") return issue("tool.effect", { toolId, effect: said(tool.effect) }, `${toolId}'s effect is neither observe nor mutate.`);
  if (tool.perCallEffect !== undefined && typeof tool.perCallEffect !== "boolean") return issue("tool.per_call_effect", { toolId }, `${toolId}'s perCallEffect is not a boolean.`);
  if (tool.actionInputKey !== undefined && (typeof tool.actionInputKey !== "string" || !ACTION_INPUT_KEY.test(tool.actionInputKey))) return issue("tool.action_input_key", { toolId }, `${toolId}'s actionInputKey is not a valid key.`);
  if (tool.repeatPolicy !== undefined && (tool.repeatPolicy !== "after_mutation" || tool.effect !== "observe")) return issue("tool.repeat_policy", { toolId, repeatPolicy: said(tool.repeatPolicy), effect: said(tool.effect) }, `${toolId}'s repeat policy is allowed only as after_mutation on a tool that observes.`);
  return initialObservationIssue(tool, toolId);
}

function initialObservationIssue(tool: Partial<AutomationStudioLlmEvidenceTool>, toolId: string): AutomationStudioLlmEvidenceLoopConfigurationIssue | undefined {
  const opening = tool.initialObservation as unknown;
  if (opening === undefined) return undefined;
  const looks = tool.effect === "observe" || tool.perCallEffect === true;
  const shaped = isRecord(opening) && isJsonObject(opening) && Object.keys(opening).every((key) => key === "input" || key === "arrival") && isJsonObject(opening.input);
  const arrives = !shaped || opening.arrival === undefined || (tool.perCallEffect === true && isJsonObject(opening.arrival));
  if (looks && shaped && arrives) return undefined;
  const why = !looks ? "only a tool that observes, or whose calls declare their own effect, may open with a look"
    : !shaped ? "it must be exactly an input object and, optionally, an arrival object"
      : "only a tool whose calls declare their own effect may carry an arrival";
  return issue("tool.initial_observation", { toolId }, `${toolId}'s opening look is refused: ${why}.`);
}

/** A refused configuration from its check, its figures as they were, and its sentence. */
export function automationStudioLlmEvidenceLoopConfigurationIssue(check: string, figures: Readonly<Record<string, unknown>>, words: string): AutomationStudioLlmEvidenceLoopConfigurationIssue {
  return { check, values: Object.fromEntries(Object.entries(figures).map(([name, value]) => [name, said(value)])), words };
}

const issue = automationStudioLlmEvidenceLoopConfigurationIssue;

/** A figure as JSON can hold it: a finite number as it is, anything else as text. */
function said(value: unknown): JsonValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(said);
  return value === undefined ? "undefined" : typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJson(value, 0);
}

function isJson(value: unknown, depth: number): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  return isRecord(value) && Object.values(value).every((item) => isJson(item, depth + 1));
}
