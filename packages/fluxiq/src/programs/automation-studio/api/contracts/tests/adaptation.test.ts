// The build request contract after t186: no grant id, an optional list of the
// consequences a person allowed, and a readiness record that names no grant
// endpoint. A field the service's build input gains and the contract lacks
// fails the type check in `pnpm check`, not a reviewer's eye.

import { describe, expect, it } from "vitest";

import type { AutomationStudioActionConsequence, AutomationStudioService } from "../../../runtime/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, type GenerateFlowBootstrapAdaptationRequest } from "../index.ts";

/** True only when the two types are identical. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type ServiceBuildInput = Parameters<AutomationStudioService["generateFlowBootstrapAdaptation"]>[0];

const noGrantField: Equal<Extract<keyof GenerateFlowBootstrapAdaptationRequest, "llmExecutionGrantId">, never> = true;
const consequencesMatch: Equal<GenerateFlowBootstrapAdaptationRequest["permittedConsequences"], AutomationStudioActionConsequence[] | undefined> = true;
const serviceTakesTheSameConsequences: Equal<NonNullable<ServiceBuildInput["permittedConsequences"]>, AutomationStudioActionConsequence[]> = true;
const serviceTakesNoGrant: Equal<Extract<keyof ServiceBuildInput, "executionGrant">, never> = true;

describe("Automation Studio build request contract", () => {
  it("carries permitted consequences and no grant, as the service's build input does", () => {
    expect([noGrantField, consequencesMatch, serviceTakesTheSameConsequences, serviceTakesNoGrant]).toEqual([true, true, true, true]);
  });

  it("names no grant endpoint or grant runtime in its readiness", () => {
    expect(Object.keys(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS.runtime).sort()).toEqual(["nativeNodeRegistryConfigured", "providerResolverConfigured"]);
    expect(JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS)).not.toMatch(/grant|preflight/i);
  });
});
