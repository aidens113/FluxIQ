// What a Flow Bootstrap generation request must be before a build may start.
//
// Every field of the request read and refused in one place, so the service is
// left with the build. The caller turns any throw from here into
// `flow_bootstrap.invalid_input` at the `pre_provider_validation` stage, which
// is what a malformed request has always been answered with.
//
// A build needs no authorization for the model calls it makes. What it carries
// is who it is made for (`caller`, whose unlocked key pays) and which lasting
// consequences the person has already allowed its actions to have
// (`permittedConsequences`); anything else consequential is asked about act by
// act.

import { automationStudioFlowStartLocation } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioBootstrapAdaptationMode } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../../../../runtime/llm/index.ts";
import { humannessSchema } from "@fluxiq/contracts/automation";
import { assertExactObjectFields, requiredBootstrapCommandId } from "../field-readings.ts";

/** The fields a generation request may carry, and the fields its caller may carry. */
const REQUEST_FIELDS = ["projectId", "flowId", "caller", "permittedConsequences", "evidenceGuided", "authoringMode", "useReusableContext", "startLocation", "permissionAskTimeoutMs", "mode", "interpretationCostUsd", "interpretationCalls", "humanness"] as const;
const CALLER_FIELDS = ["actorUserId", "actorSessionId"] as const;

/** A generation request, read. `startLocation` is absent when the caller named none. */
export type AutomationStudioFlowBootstrapGenerationRequest = {
  projectId: string;
  flowId: string;
  caller: AutomationStudioLlmModelCaller;
  permittedConsequences: AutomationStudioActionConsequence[];
  /** Whether this build writes the Flow or adds to the one already there. */
  mode: AutomationStudioBootstrapAdaptationMode;
  /** `candidate`, `project` or `answer-first` (`../../../model/authoring-mode/`); absent is legacy. */
  authoringMode?: "candidate" | "project" | "answer-first";
  startLocation?: string;
  /** How human the build's input looks, 0 to 100. Absent when none was sent. */
  humanness?: number;
  /** What the chat's reading of the message cost, carried into the creation purse. Absent when none was sent. */
  interpretationCostUsd?: number;
  /** How many priced model calls `interpretationCostUsd` sums. Absent when none was sent. */
  interpretationCalls?: number;
};

/**
 * Read one generation request, or throw naming what is wrong with it.
 *
 * `unsafeInput` is the caller's own untyped view of the input: the method is
 * reachable from an API handler, so what arrives is whatever was sent rather
 * than what the type says.
 */
export function readAutomationStudioFlowBootstrapGenerationRequest(unsafeInput: Record<string, unknown>): AutomationStudioFlowBootstrapGenerationRequest {
  assertExactObjectFields(unsafeInput, REQUEST_FIELDS, "Flow Bootstrap generation input");
  if (unsafeInput.evidenceGuided !== undefined && unsafeInput.evidenceGuided !== true) throw new Error("Evidence-guided generation flag is invalid.");
  if (unsafeInput.useReusableContext !== undefined && unsafeInput.useReusableContext !== true) throw new Error("Reusable-context generation flag is invalid.");
  if (unsafeInput.useReusableContext === true && unsafeInput.evidenceGuided !== true) throw new Error("Reusable context requires evidence-guided generation with a fresh inspection.");
  if (unsafeInput.mode !== undefined && unsafeInput.mode !== "create" && unsafeInput.mode !== "extend") throw new Error("Flow Bootstrap generation mode is invalid.");
  if (unsafeInput.authoringMode !== undefined && ((unsafeInput.authoringMode !== "candidate" && unsafeInput.authoringMode !== "project" && unsafeInput.authoringMode !== "answer-first") || unsafeInput.evidenceGuided !== true)) throw new Error("Candidate authoring requires evidence-guided generation.");
  // A project build writes a Flow from nothing; extending one is not yet a project build's (automation-project-agents-plan, A7).
  if (unsafeInput.authoringMode === "project" && unsafeInput.mode === "extend") throw new Error("Project authoring cannot extend a Flow yet.");
  const mode: AutomationStudioBootstrapAdaptationMode = unsafeInput.mode === "extend" ? "extend" : "create";
  const unsafeCaller = unsafeInput.caller;
  if (!unsafeCaller || typeof unsafeCaller !== "object" || Array.isArray(unsafeCaller)) throw new Error("Flow Bootstrap generation requires the caller it is made for.");
  const caller = unsafeCaller as Record<string, unknown>;
  assertExactObjectFields(caller, CALLER_FIELDS, "Flow Bootstrap generation caller");
  // Where the Flow starts, when the caller named one, checked here so that
  // everything downstream is handed a value rather than a field
  // (`../../flow-bootstrap/start-location.ts`).
  const startLocation = automationStudioFlowStartLocation(unsafeInput.startLocation);
  const interpretationCostUsd = unsafeInput.interpretationCostUsd;
  if (interpretationCostUsd !== undefined && (typeof interpretationCostUsd !== "number" || !Number.isFinite(interpretationCostUsd) || interpretationCostUsd < 0)) {
    throw new Error("Flow Bootstrap generation interpretation cost must be a finite, non-negative amount.");
  }
  const interpretationCalls = unsafeInput.interpretationCalls;
  if (interpretationCalls !== undefined && (!Number.isSafeInteger(interpretationCalls) || (interpretationCalls as number) < 0)) {
    throw new Error("Flow Bootstrap generation interpretation call count must be a whole, non-negative number.");
  }
  const humanness = unsafeInput.humanness;
  if (humanness !== undefined && !humannessSchema.safeParse(humanness).success) throw new Error("Flow Bootstrap generation humanness must be a whole number from 0 to 100.");
  return {
    projectId: requiredBootstrapCommandId(unsafeInput.projectId, "project"),
    flowId: requiredBootstrapCommandId(unsafeInput.flowId, "Flow"),
    mode,
    // An extend in answer-first mode builds as a candidate until a saved Flow's later attempt lands (`../../../model/authoring-mode/build-authoring-mode.ts`).
    ...(unsafeInput.authoringMode === "answer-first" ? { authoringMode: mode === "extend" ? "candidate" as const : "answer-first" as const } : unsafeInput.authoringMode === "candidate" || unsafeInput.authoringMode === "project" ? { authoringMode: unsafeInput.authoringMode } : {}),
    ...(startLocation === undefined ? {} : { startLocation }),
    ...(interpretationCostUsd === undefined ? {} : { interpretationCostUsd }),
    ...(interpretationCalls === undefined ? {} : { interpretationCalls: interpretationCalls as number }),
    ...(humanness === undefined ? {} : { humanness: humanness as number }),
    caller: {
      actorUserId: requiredBootstrapCommandId(caller.actorUserId, "actor user"),
      actorSessionId: requiredBootstrapCommandId(caller.actorSessionId, "actor session")
    },
    permittedConsequences: parseAutomationStudioPermittedConsequences(unsafeInput.permittedConsequences)
  };
}
