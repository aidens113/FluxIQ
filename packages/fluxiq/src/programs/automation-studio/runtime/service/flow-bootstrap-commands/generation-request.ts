// What a Flow Bootstrap generation request must be before a build may start.
//
// Every field of the request and of the grant it carries, read and refused in
// one place. It lived inline in `runtime/service.ts`, where twenty lines of
// field checking sat between the method's signature and the first thing it
// actually does; the checks are a cohesive job with one answer, so they are one
// function, and the service is left with the build.
//
// Refusals are unchanged, word for word: the caller turns any throw from here
// into `flow_bootstrap.invalid_input` at the `pre_provider_validation` stage,
// which is what a malformed request has always been answered with.

import { automationStudioFlowStartLocation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioBootstrapAdaptationMode } from "../../flow-bootstrap/index.ts";
import { parseAutomationStudioPermittedConsequences } from "../../action-permissions/index.ts";
import type { AutomationStudioBuildAndAdaptExecutionGrant } from "../../llm/index.ts";
import {
  assertExactObjectFields,
  requiredBootstrapCommandId,
  requiredBootstrapDigest,
  requiredBootstrapSettingsRevision
} from "./field-readings.ts";

/** The fields a generation request may carry, and the fields its grant may carry. */
const REQUEST_FIELDS = ["projectId", "flowId", "executionGrant", "evidenceGuided", "useReusableContext", "startLocation", "permissionAskTimeoutMs", "mode"] as const;
const GRANT_FIELDS = ["grantId", "actorUserId", "actorSessionId", "purpose", "executionDigest", "settingsRevision", "permittedConsequences"] as const;

/**
 * The grant purposes this entry point runs under, and why there are two.
 *
 * `build_and_adapt` is the person pressing build, and it is the only purpose a
 * `create` runs under: writing a Flow from nothing is its own act with its own
 * authorization.
 *
 * `explore_and_adapt` is accepted for an `extend`, and accepting it names the
 * grant that already buys these calls rather than widening one. That purpose is
 * by its own definition the iterating recovery that explores on its own
 * (`llm/runtime-session-grant.ts`); an extend build makes
 * `evidence_tool_decision` calls and nothing else, which the purpose already
 * permits; and what it produces is a proposal, reviewed and applied through the
 * same gates as any other. What such a grant does not carry is
 * `permittedConsequences`, so an extend entered this way permits no lasting
 * consequence at all and every consequential step raises the person's question.
 *
 * `diagnose_and_adapt` is deliberately not here. That grant buys one target
 * override under manual review and does not buy exploring, so a run holding it
 * may not be routed into a loop that explores -- which is the widening reverted
 * earlier in this task rather than something to reintroduce by another door.
 */
const GENERATION_GRANT_PURPOSES = ["build_and_adapt", "explore_and_adapt"] as const;

type AutomationStudioFlowBootstrapGenerationPurpose = (typeof GENERATION_GRANT_PURPOSES)[number];

/** A grant this entry point accepts: the build grant, or the exploring recovery's. */
export type AutomationStudioFlowBootstrapGenerationGrant =
  Omit<AutomationStudioBuildAndAdaptExecutionGrant, "purpose">
  & { purpose: AutomationStudioFlowBootstrapGenerationPurpose };

/** A generation request, read. `startLocation` is absent when the caller named none. */
export type AutomationStudioFlowBootstrapGenerationRequest = {
  projectId: string;
  flowId: string;
  executionGrant: AutomationStudioFlowBootstrapGenerationGrant;
  /** Whether this build writes the Flow or adds to the one already there. */
  mode: AutomationStudioBootstrapAdaptationMode;
  startLocation?: string;
};

/**
 * Read one generation request, or throw naming what is wrong with it.
 *
 * `unsafeInput` and `unsafeGrant` are the caller's own untyped views of the
 * input: the method is reachable from an API handler, so what arrives is
 * whatever was sent rather than what the type says.
 */
export function readAutomationStudioFlowBootstrapGenerationRequest(
  unsafeInput: Record<string, unknown>,
  unsafeGrant: Record<string, unknown> | undefined
): AutomationStudioFlowBootstrapGenerationRequest {
  assertExactObjectFields(unsafeInput, REQUEST_FIELDS, "Flow Bootstrap generation input");
  if (unsafeInput.evidenceGuided !== undefined && unsafeInput.evidenceGuided !== true) throw new Error("Evidence-guided generation flag is invalid.");
  if (unsafeInput.useReusableContext !== undefined && unsafeInput.useReusableContext !== true) throw new Error("Reusable-context generation flag is invalid.");
  if (unsafeInput.useReusableContext === true && unsafeInput.evidenceGuided !== true) throw new Error("Reusable context requires evidence-guided generation with a fresh inspection.");
  if (unsafeInput.mode !== undefined && unsafeInput.mode !== "create" && unsafeInput.mode !== "extend") throw new Error("Flow Bootstrap generation mode is invalid.");
  const mode: AutomationStudioBootstrapAdaptationMode = unsafeInput.mode === "extend" ? "extend" : "create";
  if (!unsafeGrant) throw new Error("A build_and_adapt execution grant is required.");
  assertExactObjectFields(unsafeGrant, GRANT_FIELDS, "Flow Bootstrap execution grant");
  const purpose = GENERATION_GRANT_PURPOSES.find((granted) => granted === unsafeGrant.purpose);
  // An exploring recovery's grant reaches only the door it was argued for.
  if (!purpose || (mode === "create" && purpose !== "build_and_adapt")) throw new Error("Flow Bootstrap generation requires a build_and_adapt execution grant.");
  // Where the Flow starts, when the caller named one, checked here so that
  // everything downstream is handed a value rather than a field
  // (`../../flow-bootstrap/start-location.ts`).
  const startLocation = automationStudioFlowStartLocation(unsafeInput.startLocation);
  return {
    projectId: requiredBootstrapCommandId(unsafeInput.projectId, "project"),
    flowId: requiredBootstrapCommandId(unsafeInput.flowId, "Flow"),
    mode,
    ...(startLocation === undefined ? {} : { startLocation }),
    executionGrant: {
      grantId: requiredBootstrapCommandId(unsafeGrant.grantId, "execution grant"),
      actorUserId: requiredBootstrapCommandId(unsafeGrant.actorUserId, "actor user"),
      actorSessionId: requiredBootstrapCommandId(unsafeGrant.actorSessionId, "actor session"),
      purpose,
      executionDigest: requiredBootstrapDigest(unsafeGrant.executionDigest),
      settingsRevision: requiredBootstrapSettingsRevision(unsafeGrant.settingsRevision),
      permittedConsequences: parseAutomationStudioPermittedConsequences(unsafeGrant.permittedConsequences)
    }
  };
}
