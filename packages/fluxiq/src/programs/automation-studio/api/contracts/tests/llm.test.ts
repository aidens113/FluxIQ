// The public LLM execution contract must say what the handlers accept and
// return. The handlers forward these requests to the grant service field by
// field and return its record as it is, so every check here compares the
// contract with the grant service itself. A field the service gains and the
// contract lacks -- as `maxTotalTokensPerRun` and `explore_and_adapt` once
// were -- fails the type check in `pnpm check`, not a reviewer's eye.

import { describe, expect, it } from "vitest";

import type { IdentityAccessService } from "../../../../identity-access/index.ts";
import type { SecretKeysService } from "../../../../secret-keys/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD,
  AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES,
  AutomationStudioLlmExecutionGrantService,
  type AutomationStudioLlmExecutionGrantMetadata,
  type AutomationStudioLlmExecutionGrantPurpose,
  type AutomationStudioRuntimeSessionGrantPurpose
} from "../../../runtime/index.ts";
import type {
  AutomationStudioLlmExecutionGrant,
  AutomationStudioLlmExecutionGrantRequest,
  AutomationStudioLlmExecutionLimitRequest,
  AutomationStudioLlmExecutionPreflight,
  AutomationStudioLlmExecutionPreflightRequest,
  AutomationStudioLlmExecutionPurpose,
  AutomationStudioRuntimeSessionLlmIntent
} from "../index.ts";

/** True only when the two types are identical. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** True when the two have the same keys and each is assignable to the other. */
type SameShape<A, B> = Equal<keyof A, keyof B> extends true
  ? [A] extends [B] ? [B] extends [A] ? true : false : false
  : false;

type ServicePreflightInput = Parameters<AutomationStudioLlmExecutionGrantService["preflight"]>[0];
type ServiceIssueInput = Parameters<AutomationStudioLlmExecutionGrantService["issue"]>[0];
/** The limits the service takes, without the identity fields a request names separately. */
type ServiceLimits = Omit<ServicePreflightInput, "keyId" | "projectId" | "flowId" | "provider" | "model" | "purpose">;
/** Service input the handler fills from the authenticated actor, not from the request. */
type ActorFields = "actorUserId" | "actorSessionId";

const purposesMatch: Equal<AutomationStudioLlmExecutionPurpose, AutomationStudioLlmExecutionGrantPurpose> = true;
const runtimeIntentsMatch: Equal<AutomationStudioRuntimeSessionLlmIntent, AutomationStudioRuntimeSessionGrantPurpose> = true;
const limitsMatch: SameShape<AutomationStudioLlmExecutionLimitRequest, ServiceLimits> = true;
const everyPreflightFieldIsInTheContract: Equal<Exclude<keyof ServicePreflightInput, keyof AutomationStudioLlmExecutionPreflightRequest>, never> = true;
const everyIssueFieldIsInTheContract: Equal<Exclude<Exclude<keyof ServiceIssueInput, ActorFields>, keyof AutomationStudioLlmExecutionGrantRequest>, never> = true;
const grantMatches: SameShape<AutomationStudioLlmExecutionGrant, AutomationStudioLlmExecutionGrantMetadata> = true;
const preflightMatches: SameShape<AutomationStudioLlmExecutionPreflight, Awaited<ReturnType<AutomationStudioLlmExecutionGrantService["preflight"]>>> = true;

describe("Automation Studio LLM execution API contract", () => {
  it("names the same purposes, request fields and grant record as the grant service", () => {
    expect([purposesMatch, runtimeIntentsMatch, limitsMatch, everyPreflightFieldIsInTheContract, everyIssueFieldIsInTheContract, grantMatches, preflightMatches]).toEqual([true, true, true, true, true, true, true]);
  });

  it("lists every runtime-session purpose Core accepts, and not build_and_adapt", () => {
    const intents: readonly AutomationStudioRuntimeSessionLlmIntent[] = AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES;
    expect([...intents].sort()).toEqual(["diagnose_and_adapt", "diagnosis_only", "explore_and_adapt"]);
    expect(intents).not.toContain("build_and_adapt");
  });

  // 60,000 rather than a round 40,000: a run budget may never be below one
  // call's ceiling, and that is now 56,000. It is still well under the default
  // run budget, which is ten of those calls, and that is what makes this a
  // caller asking for less.
  it("gets an explore_and_adapt preflight with a run token budget from the real grant service", async () => {
    const service = contractGrantService();
    const request: AutomationStudioLlmExecutionPreflightRequest = { projectId: "project.one", flowId: "flow.one", keyId: "secret:key", purpose: "explore_and_adapt", maxTotalTokensPerRun: 60_000 };
    const preflight: AutomationStudioLlmExecutionPreflight = await service.preflight(request);
    expect(preflight).toMatchObject({ purpose: "explore_and_adapt", maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS, maxTotalTokensPerRun: 60_000, providerRetryCount: 0 });
  });

  it("describes the defaults the grant service applies when a request names no count or budget", async () => {
    const service = contractGrantService();
    const request: AutomationStudioLlmExecutionPreflightRequest = { projectId: "project.one", flowId: "flow.one", keyId: "secret:key", purpose: "diagnose_and_adapt" };
    const preflight = await service.preflight(request);
    // What the field comments in the contract promise. The per-call limits are
    // deepseek-chat's own 64k context less room for the reply; the call count
    // did not move with them, and the run budget is the confirmation threshold,
    // which is ten of those calls rather than a number written down beside
    // them -- written down, it stopped being ten calls the moment a call grew.
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS).toBe(26);
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS).toBe(64);
    expect(preflight.tokenLimits).toEqual({ maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 });
    expect(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD).toBe(preflight.tokenLimits.maxTotalTokens * 10);
    expect(preflight).toMatchObject({ maxCalls: 26, maxTotalTokensPerRun: AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD });
    await expect(service.preflight({ ...request, purpose: "diagnosis_only", maxCalls: 2 })).rejects.toThrow("exactly one");
    await expect(service.preflight({ ...request, maxCalls: 65 })).rejects.toThrow("call limit");
    await expect(service.preflight({ ...request, maxTotalTokensPerRun: 9_999 })).rejects.toThrow("total token limit");
  });
});

/** A grant service that can answer a preflight: an enabled DeepSeek key and a
 * Flow bound to a settings revision. Preflight touches nothing else. */
function contractGrantService(): AutomationStudioLlmExecutionGrantService {
  const key = { id: "secret:key", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-chat" } };
  const secretKeys = { getKeySummary: async (id: string) => (id === key.id ? key : undefined) } as unknown as SecretKeysService;
  return new AutomationStudioLlmExecutionGrantService({
    identityAccess: {} as IdentityAccessService,
    secretKeys,
    resolveExecutionDigest: async () => ({ executionDigest: "execution-digest.one", settingsRevision: 1 })
  });
}
