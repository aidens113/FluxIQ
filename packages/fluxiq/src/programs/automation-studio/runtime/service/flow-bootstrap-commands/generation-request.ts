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
import { parseAutomationStudioPermittedConsequences } from "../../action-permissions/index.ts";
import type { AutomationStudioBuildAndAdaptExecutionGrant } from "../../llm/index.ts";
import {
  assertExactObjectFields,
  requiredBootstrapCommandId,
  requiredBootstrapDigest,
  requiredBootstrapSettingsRevision
} from "./field-readings.ts";

/** The fields a generation request may carry, and the fields its grant may carry. */
const REQUEST_FIELDS = ["projectId", "flowId", "executionGrant", "evidenceGuided", "useReusableContext", "startLocation", "permissionAskTimeoutMs"] as const;
const GRANT_FIELDS = ["grantId", "actorUserId", "actorSessionId", "purpose", "executionDigest", "settingsRevision", "permittedConsequences"] as const;

/** A generation request, read. `startLocation` is absent when the caller named none. */
export type AutomationStudioFlowBootstrapGenerationRequest = {
  projectId: string;
  flowId: string;
  executionGrant: AutomationStudioBuildAndAdaptExecutionGrant;
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
  if (!unsafeGrant) throw new Error("A build_and_adapt execution grant is required.");
  assertExactObjectFields(unsafeGrant, GRANT_FIELDS, "Flow Bootstrap execution grant");
  if (unsafeGrant.purpose !== "build_and_adapt") throw new Error("Flow Bootstrap generation requires a build_and_adapt execution grant.");
  // Where the Flow starts, when the caller named one, checked here so that
  // everything downstream is handed a value rather than a field
  // (`../../flow-bootstrap/start-location.ts`).
  const startLocation = automationStudioFlowStartLocation(unsafeInput.startLocation);
  return {
    projectId: requiredBootstrapCommandId(unsafeInput.projectId, "project"),
    flowId: requiredBootstrapCommandId(unsafeInput.flowId, "Flow"),
    ...(startLocation === undefined ? {} : { startLocation }),
    executionGrant: {
      grantId: requiredBootstrapCommandId(unsafeGrant.grantId, "execution grant"),
      actorUserId: requiredBootstrapCommandId(unsafeGrant.actorUserId, "actor user"),
      actorSessionId: requiredBootstrapCommandId(unsafeGrant.actorSessionId, "actor session"),
      purpose: "build_and_adapt",
      executionDigest: requiredBootstrapDigest(unsafeGrant.executionDigest),
      settingsRevision: requiredBootstrapSettingsRevision(unsafeGrant.settingsRevision),
      permittedConsequences: parseAutomationStudioPermittedConsequences(unsafeGrant.permittedConsequences)
    }
  };
}
