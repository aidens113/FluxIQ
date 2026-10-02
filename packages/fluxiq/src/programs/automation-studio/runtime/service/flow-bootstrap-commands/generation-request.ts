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

import { automationStudioFlowStartLocation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioBootstrapAdaptationMode } from "../../flow-bootstrap/index.ts";
import { parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../llm/index.ts";
import { assertExactObjectFields, requiredBootstrapCommandId } from "./field-readings.ts";

/** The fields a generation request may carry, and the fields its caller may carry. */
const REQUEST_FIELDS = ["projectId", "flowId", "caller", "permittedConsequences", "evidenceGuided", "useReusableContext", "startLocation", "permissionAskTimeoutMs", "mode", "interpretationCostUsd"] as const;
const CALLER_FIELDS = ["actorUserId", "actorSessionId"] as const;

/** A generation request, read. `startLocation` is absent when the caller named none. */
export type AutomationStudioFlowBootstrapGenerationRequest = {
  projectId: string;
  flowId: string;
  caller: AutomationStudioLlmModelCaller;
  permittedConsequences: AutomationStudioActionConsequence[];
  /** Whether this build writes the Flow or adds to the one already there. */
  mode: AutomationStudioBootstrapAdaptationMode;
  startLocation?: string;
  /** What the chat's reading of the message cost, carried into the creation purse. Absent when none was sent. */
  interpretationCostUsd?: number;
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
  return {
    projectId: requiredBootstrapCommandId(unsafeInput.projectId, "project"),
    flowId: requiredBootstrapCommandId(unsafeInput.flowId, "Flow"),
    mode,
    ...(startLocation === undefined ? {} : { startLocation }),
    ...(interpretationCostUsd === undefined ? {} : { interpretationCostUsd }),
    caller: {
      actorUserId: requiredBootstrapCommandId(caller.actorUserId, "actor user"),
      actorSessionId: requiredBootstrapCommandId(caller.actorSessionId, "actor session")
    },
    permittedConsequences: parseAutomationStudioPermittedConsequences(unsafeInput.permittedConsequences)
  };
}
