// The contract for a harness option: one action the exploration loop may take
// to gather information.
//
// An option is an evidence-loop tool plus the scoping metadata that decides
// whether the loop may be offered it at all. The metadata deliberately reuses
// the node registry's vocabulary -- availability, required runtime
// capabilities, required permissions -- so a domain declares an option the way
// it already declares a node, and one gate covers both.
//
// Nothing here names a page, a selector, a tab or a browser. An option's
// subject is a Flow, its nodes, and whatever state the host reports. A domain
// with none of the web's nouns declares options in exactly this shape, which
// is what makes the loop the same loop for every domain.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeAvailability } from "../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { isAutomationStudioLoopStage, type AutomationStudioLoopStage } from "../stages/index.ts";

/** Maximum options one registry may hold, matching the evidence loop's own
 * ceiling on the tool list it will accept. */
export const AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT = 32;

/**
 * A stage of the loop's fixed order of work. Carried as an opaque identifier
 * while the stage protocol was still to land; now it is the protocol's own
 * closed vocabulary, so an option pinned to a stage nobody will ever be in is a
 * registration error rather than an option that silently never appears.
 */
export type AutomationStudioHarnessOptionStage = AutomationStudioLoopStage;

/**
 * What running the option does beyond producing evidence.
 *
 * `none` and `observe` read. `mutate` changes the state the Flow acts on in
 * order to reveal evidence that is otherwise unreachable. `destructive`
 * removes or irreversibly commits something; the registry never offers one,
 * because gathering information never requires destroying anything.
 */
export type AutomationStudioHarnessOptionSideEffect = "none" | "observe" | "mutate" | "destructive";

export type AutomationStudioHarnessOptionSafety = {
  sideEffect: AutomationStudioHarnessOptionSideEffect;
  requiredPermissions?: string[];
  requiresOperatorApproval?: boolean;
};

/**
 * One registered action. The evidence-loop tool fields are the half the model
 * ever sees; the rest is the gate, and is stripped before the option reaches a
 * provider.
 */
export type AutomationStudioHarnessOption = AutomationStudioLlmEvidenceTool & {
  availability: AutomationStudioNodeAvailability;
  requiredRuntimeCapabilities?: string[];
  safety?: AutomationStudioHarnessOptionSafety;
  /** Stages this option may be offered in. Absent means every stage. */
  stages?: AutomationStudioHarnessOptionStage[];
};

export type AutomationStudioHarnessOptionExecution = {
  projectId: string;
  flowId: string;
  runId?: string;
  callId: string;
  optionId: string;
  value: JsonObject;
  maxEvidenceBytes: number;
  signal?: AbortSignal;
  /**
   * Ask before doing anything that outlasts the action. An option whose action
   * would move money, delete, send or publish, change what already exists or
   * create something new calls this first, with the consequences it would
   * have and the control as a person would name it, and takes the action only
   * on `permitted: true`. Core holds what the run was allowed; the option never
   * decides that for itself. An option that only looks never calls it.
   */
  permission: AutomationStudioActionPermissionCheck;
};

export type AutomationStudioHarnessOptionImplementation = (
  input: AutomationStudioHarnessOptionExecution
) => Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;

/**
 * Declarations and implementations arrive together but are stored apart: the
 * registry's browsing surface returns declarations only, so listing the
 * options the loop may take never hands out host code.
 *
 * `domainId` absent means Core's own bundle. A domain bundle may only declare
 * domain-scoped options and Core's may only declare unscoped ones, so a domain
 * extends the set and can neither replace nor widen Core's half.
 */
export type AutomationStudioHarnessOptionBundle = {
  schemaVersion: "0.1";
  domainId?: string;
  options: AutomationStudioHarnessOption[];
  implementations: Record<string, AutomationStudioHarnessOptionImplementation>;
};

const OPTION_ID = /^[a-z0-9_.:-]{1,200}$/i;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const SIDE_EFFECTS = new Set<string>(["none", "observe", "mutate", "destructive"]);

/**
 * Validation codes for one option, empty when it is valid. A registered option
 * must satisfy everything the evidence loop's own tool check demands, so an
 * option the registry accepts can never be a tool the loop then rejects.
 */
export function automationStudioHarnessOptionIssues(option: AutomationStudioHarnessOption): string[] {
  const issues: string[] = [];
  if (typeof option.toolId !== "string" || !OPTION_ID.test(option.toolId)) issues.push("harness_option.id_invalid");
  if (typeof option.description !== "string" || !option.description.length || option.description.length > 2_000) issues.push("harness_option.description_invalid");
  if (!isRecord(option.inputSchema)) issues.push("harness_option.input_schema_invalid");
  if (option.effect !== undefined && option.effect !== "observe" && option.effect !== "mutate") issues.push("harness_option.effect_invalid");
  if (option.repeatPolicy !== undefined && (option.repeatPolicy !== "after_mutation" || option.effect !== "observe")) issues.push("harness_option.repeat_policy_invalid");
  if (option.perCallEffect !== undefined && typeof option.perCallEffect !== "boolean") issues.push("harness_option.per_call_effect_invalid");
  // A free first look is a look. That is an option that only observes -- or one
  // whose calls declare their own effect, whose initial argument the host
  // writes rather than the model, and which is therefore the host's own
  // statement that this one call observes.
  if (option.initialObservation !== undefined
    && ((option.effect !== "observe" && option.perCallEffect !== true) || !isRecord(option.initialObservation) || !isRecord(option.initialObservation.input)
      || Object.keys(option.initialObservation).some((key) => key !== "input"))) {
    issues.push("harness_option.initial_observation_invalid");
  }
  issues.push(...availabilityIssues(option.availability));
  if (option.requiredRuntimeCapabilities !== undefined && !isIdentifierList(option.requiredRuntimeCapabilities)) issues.push("harness_option.runtime_capabilities_invalid");
  if (option.stages !== undefined && (!Array.isArray(option.stages) || !option.stages.length || !option.stages.every(isAutomationStudioLoopStage))) issues.push("harness_option.stages_invalid");
  issues.push(...safetyIssues(option));
  return issues;
}

/**
 * The option as the evidence loop and the provider accept it: the six tool
 * fields and nothing else. Provider adapters reject an unknown key on a tool,
 * so the gate metadata is dropped here rather than travelling and being
 * ignored. Written field by field, never spread, so a renamed tool field is a
 * compile error instead of a silently wider payload.
 */
export function automationStudioHarnessOptionTool(option: AutomationStudioHarnessOption): AutomationStudioLlmEvidenceTool {
  return {
    toolId: option.toolId,
    description: option.description,
    inputSchema: option.inputSchema,
    ...(option.effect !== undefined ? { effect: option.effect } : {}),
    ...(option.perCallEffect === true ? { perCallEffect: true } : {}),
    ...(option.repeatPolicy !== undefined ? { repeatPolicy: option.repeatPolicy } : {}),
    ...(option.initialObservation !== undefined ? { initialObservation: option.initialObservation } : {})
  };
}

function availabilityIssues(availability: AutomationStudioNodeAvailability): string[] {
  if (!isRecord(availability)) return ["harness_option.availability_invalid"];
  if (availability.kind === "global" || availability.kind === "both") return [];
  if (availability.kind === "domain" && typeof availability.domainId === "string" && IDENTIFIER.test(availability.domainId)) return [];
  return ["harness_option.availability_invalid"];
}

function safetyIssues(option: AutomationStudioHarnessOption): string[] {
  const safety = option.safety;
  if (safety === undefined) return option.effect === "mutate" ? ["harness_option.side_effect_undeclared"] : [];
  if (!isRecord(safety) || typeof safety.sideEffect !== "string" || !SIDE_EFFECTS.has(safety.sideEffect)) return ["harness_option.safety_invalid"];
  const issues: string[] = [];
  if (safety.requiredPermissions !== undefined && !isIdentifierList(safety.requiredPermissions)) issues.push("harness_option.permissions_invalid");
  if (safety.requiresOperatorApproval !== undefined && typeof safety.requiresOperatorApproval !== "boolean") issues.push("harness_option.safety_invalid");
  // A mislabelled option would otherwise walk past the policy gate: the loop
  // tracks mutation from `effect`, the gate reads `sideEffect`, so the two must
  // agree or one of them is decorative.
  const mutating = safety.sideEffect === "mutate" || safety.sideEffect === "destructive";
  if (mutating !== (option.effect === "mutate")) issues.push("harness_option.side_effect_mismatch");
  return issues;
}

function isIdentifierList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === "string" && IDENTIFIER.test(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

