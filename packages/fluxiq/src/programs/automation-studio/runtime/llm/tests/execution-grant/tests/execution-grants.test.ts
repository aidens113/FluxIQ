import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../harness.ts";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS,
  AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD
} from "../../../execution/index.ts";
import { automationStudioRuntimeSessionGrantTaskKinds } from "../../../runtime-session-grant.ts";
import { evidenceRequest, gatherRequest, issueInput, patchRequest, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

/**
 * The high-token confirmation threshold, taken from the code rather than
 * written down here.
 *
 * It is ten full calls, not an absolute, so it follows the per-call limit when
 * that moves. It was the literal 100_000 on both sides -- in the code and in
 * these titles -- and when the per-call limit rose to deepseek-flash's real
 * context that silently became under two calls' worth. The titles below take
 * the formatted number from the same place the assertions do, so no title here
 * can state a number the code no longer uses.
 */
const THRESHOLD = AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD;
const THRESHOLD_LABEL = THRESHOLD.toLocaleString("en-US");

afterEach(() => vi.useRealTimers());

describe("Automation Studio LLM execution grants", () => {
  it("issues only sanitized metadata without revealing or retaining a provider secret", async () => {
    const fixture = setup();
    const grant = await fixture.service.issue(issueInput());
    expect(JSON.stringify(grant)).not.toContain("test-secret");
    expect(JSON.stringify(fixture.service)).not.toContain("password");
    expect(grant).toMatchObject({
      provider: "deepseek",
      model: "deepseek-flash",
      purpose: "diagnosis_only",
      maxCalls: 1,
      maxEstimatedCostUsd: 0.25,
      remainingUses: 1,
      executionDigest: "execution-digest.one"
    });
    expect(fixture.revealAuthorizationCount).toBe(1);
    expect(fixture.revealCount).toBe(0);
    const storedGrant = [...(fixture.service as any).grants.values()][0];
    expect(storedGrant.revealAuthorizationIds).toHaveLength(1);
    expect(storedGrant).not.toHaveProperty("revealAuthorizationId");
    expect(storedGrant).not.toHaveProperty("authorizationPassword");
    expect(storedGrant).not.toHaveProperty("authorizationPin");

    const resolved = await fixture.service.resolve(resolveInput(grant.grantId));
    expect(fixture.revealCount).toBe(0);
    await expect(resolved.provider.runTask(request())).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(fixture.revealCount).toBe(1);
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
  });

  it("claims atomically before async validation and rejects concurrent resolution", async () => {
    const fixture = setup();
    const grant = await fixture.service.issue(issueInput());
    const first = fixture.service.resolve(resolveInput(grant.grantId));
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
    await expect(first).resolves.toMatchObject({ maxCallsPerRun: 1 });
  });

  it("requires an active matching actor session at issue time without credential resubmission", async () => {
    const fixture = setup();
    fixture.sessionValid = false;
    await expect(fixture.service.issue(issueInput())).rejects.toThrow("actor session");
    expect(fixture.revealAuthorizationCount).toBe(0);
  });

  it(`requires explicit confirmation when a future supported profile exceeds ${THRESHOLD_LABEL} total tokens`, async () => {
    const fixture = setup();
    const ordinary = await fixture.service.preflight(issueInput());
    vi.spyOn(fixture.service, "preflight").mockResolvedValue({
      ...ordinary,
      tokenLimits: { maxInputTokens: THRESHOLD, maxOutputTokens: 1_000, maxTotalTokens: THRESHOLD + 1 }
    });
    await expect(fixture.service.issue(issueInput())).rejects.toThrow("explicit confirmation");
    await expect(fixture.service.issue({ ...issueInput(), highTokenConfirmation: true })).resolves.toMatchObject({
      tokenLimits: { maxTotalTokens: THRESHOLD + 1 }
    });
  });

  // The confirmation is about tokens, not calls. A grant's run token budget
  // defaults to its calls times the per-call limit held to the threshold, so
  // many calls alone never ask; a run budget above the threshold always does.
  //
  // The call counts are the threshold's own arithmetic rather than chosen
  // numbers: it is ten full calls, so one call short of ten sits under it and
  // one call past ten is held down to it. Written that way, the case still
  // reads correctly the next time the per-call limit moves.
  it(`requires confirmation only when the run's token budget exceeds ${THRESHOLD_LABEL} tokens`, async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const perCall = (await fixture.service.preflight(issueInput())).tokenLimits.maxTotalTokens;
    const callsToThreshold = THRESHOLD / perCall;
    expect(callsToThreshold).toBe(10);
    const under = { ...issueInput(), purpose: "build_and_adapt" as const, maxCalls: callsToThreshold - 1, maxUses: callsToThreshold - 1 };
    const over = { ...under, maxCalls: callsToThreshold + 1, maxUses: callsToThreshold + 1 };
    await expect(fixture.service.issue(under)).resolves.toMatchObject({ maxCalls: callsToThreshold - 1, maxTotalTokensPerRun: perCall * (callsToThreshold - 1) });
    // Eleven calls' worth is past the threshold, so by default the run is held to it.
    await expect(fixture.service.issue(over)).resolves.toMatchObject({ maxCalls: callsToThreshold + 1, maxTotalTokensPerRun: THRESHOLD });
    // Asking for more than the threshold is asking to confirm it.
    await expect(fixture.service.issue({ ...over, maxTotalTokensPerRun: THRESHOLD + 1 })).rejects.toThrow("explicit confirmation");
    await expect(fixture.service.issue({ ...over, maxTotalTokensPerRun: THRESHOLD + 1, highTokenConfirmation: true })).resolves.toMatchObject({ maxCalls: callsToThreshold + 1, maxTotalTokensPerRun: THRESHOLD + 1 });
    // A run budget is at least one call and at most every call.
    await expect(fixture.service.preflight({ ...over, maxTotalTokensPerRun: perCall * (callsToThreshold + 1) + 1 })).rejects.toThrow("total token limit");
    await expect(fixture.service.preflight({ ...over, maxTotalTokensPerRun: perCall - 1 })).rejects.toThrow("total token limit");
    await expect(fixture.service.preflight({ ...over, maxTotalTokensPerRun: perCall + 0.5 })).rejects.toThrow("total token limit");
  });

  it("rechecks active state after a delayed just-in-time reveal crosses the run lease", async () => {
    const fixture = setup();
    fixture.delayReveal = true;
    const grant = await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    const resolved = await fixture.service.resolve(resolveInput(grant.grantId));
    const pending = resolved.provider.runTask(request());
    await fixture.revealStarted;
    fixture.now = 1 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    fixture.releaseReveal();
    await expect(pending).rejects.toThrow("cancelled");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("invalidates grants on scope, execution dependency digest, key changes, logout, and expiry", async () => {
    const fixture = setup();
    let grant = await fixture.service.issue(issueInput());
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), flowId: "flow.other" })).rejects.toThrow("scope");
    grant = await fixture.service.issue(issueInput());
    fixture.key.updatedAtMs += 1;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.key.updatedAtMs -= 1;
    grant = await fixture.service.issue(issueInput());
    fixture.executionDigest = "execution-digest.two";
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.executionDigest = "execution-digest.one";
    grant = await fixture.service.issue(issueInput());
    fixture.key.enabled = false;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.key.enabled = true;
    grant = await fixture.service.issue(issueInput());
    fixture.sessionValid = false;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.sessionValid = true;
    grant = await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    fixture.now = 2001;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
  });

  it("actively removes unused grants and their reveal authorizations on timer expiry and close", async () => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    expect(fixture.service.activeGrantCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revokeAuthorizationCount).toBe(1);
    await fixture.service.issue(issueInput());
    fixture.service.close();
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revokeAuthorizationCount).toBe(2);
  });

  it("accepts bounded user limits and rejects values beyond hard ceilings", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({
      keyId: "secret:key",
      projectId: "project.one",
      flowId: "flow.one",
      provider: "deepseek",
      model: "deepseek-flash",
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCalls: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 45_000
    })).resolves.toMatchObject({
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCalls: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 45_000
    });
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxTotalTokens: 64_001 } })).rejects.toThrow("token limits");
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", maxCalls: 2 })).rejects.toThrow("exactly one");
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", maxEstimatedCostUsd: 0.251 })).rejects.toThrow("cost");
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", timeoutMs: 45_001 })).rejects.toThrow("timeout");
  });

  it("issues revision-bound build_and_adapt grants with bounded sequential per-call authorization", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({
      ...issueInput(),
      purpose: "build_and_adapt",
      maxCalls: 3,
      maxUses: 3,
      maxEstimatedCostUsd: 0.1,
      maxTotalEstimatedCostUsd: 0.3,
      providerRetryCount: 0
    });
    expect(grant).toMatchObject({
      purpose: "build_and_adapt",
      keyUpdatedAtMs: 1,
      settingsRevision: 7,
      maxCalls: 3,
      remainingUses: 3,
      maxTotalEstimatedCostUsd: 0.3,
      providerRetryCount: 0
    });
    expect(fixture.revealAuthorizationCount).toBe(3);
    const storedGrant = [...(fixture.service as any).grants.values()][0];
    expect(storedGrant.revealAuthorizationIds).toHaveLength(3);
    expect(storedGrant).not.toHaveProperty("authorizationPassword");
    expect(storedGrant).not.toHaveProperty("authorizationPin");
    expect(storedGrant).not.toHaveProperty("secret");
    expect(storedGrant).not.toHaveProperty("value");

    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    expect(resolved).toMatchObject({ maxCallsPerRun: 3, maxTotalEstimatedCostUsd: 0.3, providerRetryCount: 0 });
    for (let index = 0; index < 3; index += 1) {
      await expect(resolved.provider.runTask({ ...request(), requestId: `request.${index}`, idempotencyKey: `request.${index}`, maxEstimatedCostUsd: 0.1 })).resolves.toBeDefined();
    }
    expect(fixture.revealCount).toBe(3);
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("issues an exact-revision adapt grant whose call count is configuration, not the purpose's identity", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt" });
    expect(grant).toMatchObject({
      purpose: "diagnose_and_adapt",
      settingsRevision: 7,
      maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
      remainingUses: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS
    });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" }, {
      allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("diagnose_and_adapt")
    });
    await expect(resolved.provider.runTask(request())).resolves.toBeDefined();
    await expect(resolved.provider.runTask(patchRequest())).resolves.toBeDefined();
    expect(fixture.revealCount).toBe(2);
    // Two calls no longer exhaust it: the recovery's guards decide when it stops.
    expect(fixture.service.activeGrantCount()).toBe(1);
    fixture.service.revoke(grant.grantId);

    // A caller that configures a number gets that number, for any iterating
    // purpose, up to the one absolute backstop and no further.
    for (const purpose of ["diagnose_and_adapt", "explore_and_adapt", "build_and_adapt"] as const) {
      await expect(fixture.service.preflight({ ...issueInput(), purpose, maxCalls: 3 })).resolves.toMatchObject({ maxCalls: 3 });
      await expect(fixture.service.preflight({ ...issueInput(), purpose, maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS, highTokenConfirmation: true } as any)).resolves.toMatchObject({ maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS });
      await expect(fixture.service.preflight({ ...issueInput(), purpose, maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS + 1 })).rejects.toThrow("call limit");
    }
    // The backstop is set far above any recovery. More calls do not by
    // themselves ask for confirmation -- the run's token budget stays at the
    // threshold -- and a caller asking for a larger token budget still does.
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS).toBeGreaterThanOrEqual(32);
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS).toBeGreaterThan(2);
    const beyondDefault = AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS + 1;
    await expect(fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS })).resolves.toMatchObject({ maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS, maxTotalTokensPerRun: THRESHOLD });
    await expect(fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: beyondDefault, maxTotalTokensPerRun: THRESHOLD + 1 })).rejects.toThrow("High-token");
    await expect(fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: beyondDefault, maxTotalTokensPerRun: THRESHOLD + 1, highTokenConfirmation: true })).resolves.toMatchObject({ maxCalls: beyondDefault, maxTotalTokensPerRun: THRESHOLD + 1 });

    const forbidden = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt" });
    const forbiddenResolved = await fixture.service.resolve({ ...resolveInput(forbidden.grantId), purpose: "diagnose_and_adapt" }, {
      allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("diagnose_and_adapt")
    });
    await expect(forbiddenResolved.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toThrow("request mismatch");
  });

  // The sequence that failed live, twice, against the real provider: the model
  // is asked for a diagnosis, answers that it must look first, asks to gather,
  // gathers, and only then answers. Every call below goes through the real
  // grant service, the real DeepSeek provider contract and the exact task-kind
  // policy the host binds for a runtime recovery.
  it.each(["diagnose_and_adapt", "explore_and_adapt"] as const)("lets a %s recovery stage a diagnosis, gather evidence and then answer", async (purpose) => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.script.push(
      { kind: "diagnosis", summary: "The control moved; look at the page before changing anything.", diagnosis: { explorationNeeded: true, patchNeeded: true } },
      { kind: "evidence_tool_decision", summary: "Inspect the form first.", decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} } },
      { kind: "evidence_tool_decision", summary: "The replacement control is present.", decision: { kind: "complete", result: { findings: "target.1 is the replacement." } } },
      { kind: "runtime_patch", summary: "Use the observed replacement.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "node.one", target: { handles: { element: "target.1" } }, reason: "Observed while gathering." }] }
    );
    const grant = await fixture.service.issue({ ...issueInput(), purpose });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose }, {
      allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds(purpose)
    });

    const ask = async (task: AutomationStudioLlmTaskRequest) => ((await resolved.provider.runTask(task)) as { response?: unknown }).response;
    expect(await ask(request())).toMatchObject({ kind: "diagnosis", diagnosis: { explorationNeeded: true } });
    expect(await ask(gatherRequest(1, []))).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "tool_call", toolId: "inspect" } });
    expect(await ask(gatherRequest(2, [{ callId: "call.1", toolId: "inspect", value: { control: "target.1" } }]))).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "complete" } });
    expect(await ask(patchRequest())).toMatchObject({ kind: "runtime_patch", patches: [{ kind: "temporary_target_override" }] });

    expect(fixture.script).toEqual([]);
    expect(fixture.revealCount).toBe(4);
    expect(fixture.service.activeGrantCount()).toBe(1);
    fixture.service.revoke(grant.grantId);
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("scopes a runtime recovery to diagnosing, gathering and repairing, whatever its grant would also allow", () => {
    expect(automationStudioRuntimeSessionGrantTaskKinds("diagnosis_only")).toEqual(["runtime_diagnosis"]);
    for (const purpose of ["diagnose_and_adapt", "explore_and_adapt"] as const) {
      expect(automationStudioRuntimeSessionGrantTaskKinds(purpose)).toEqual(["runtime_diagnosis", "evidence_tool_decision", "runtime_patch", "loop_plan", "loop_verification"]);
    }
    // Asking for an instruction suggestion or a Flow change is not a recovery.
    expect(automationStudioRuntimeSessionGrantTaskKinds("explore_and_adapt")).not.toContain("instruction_suggestion");
    expect(automationStudioRuntimeSessionGrantTaskKinds("explore_and_adapt")).not.toContain("change_proposal_generation");
  });

  it("opens the exploration loop to a failure or edge case, and to the adapt grant a person may already hold", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    const exploreProvider = async () => {
      const grant = await fixture.service.issue({ ...issueInput(), purpose: "explore_and_adapt" });
      const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "explore_and_adapt" });
      return { grant, provider: resolved.provider };
    };

    // The entry point that did not exist: a run that failed, or an existing
    // Flow that met a case it was not built for, reaching the same loop.
    const diagnosis = await exploreProvider();
    expect(diagnosis.grant).toMatchObject({
      purpose: "explore_and_adapt",
      settingsRevision: 7,
      maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
      remainingUses: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS
    });
    await expect(diagnosis.provider.runTask(request())).resolves.toBeDefined();

    // The loop's own task kind is no longer forbidden to this entry point. It
    // still fails here, on the evidence-loop context this bare request has
    // not got, which is the provider's check and not the grant table's.
    const loop = await exploreProvider();
    const loopOutcome = await loop.provider.runTask(evidenceRequest()).then(() => "allowed").catch((error: Error) => error.message);
    expect(loopOutcome).not.toContain("request mismatch");

    // Building a Flow from nothing is still build_and_adapt's alone.
    const bootstrap = await exploreProvider();
    await expect(bootstrap.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toThrow("request mismatch");

    // The adapt grant a person may already hold may now gather too: asking for
    // evidence is part of diagnosing, and forbidding it is what left live
    // diagnoses staged and unvalidated. What it may *change* is still narrower
    // than exploring: it never reaches an instruction suggestion.
    const narrow = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt" });
    const narrowResolved = await fixture.service.resolve({ ...resolveInput(narrow.grantId), purpose: "diagnose_and_adapt" });
    const narrowOutcome = await narrowResolved.provider.runTask(evidenceRequest()).then(() => "allowed").catch((error: Error) => error.message);
    expect(narrowOutcome).not.toContain("request mismatch");
    const narrowSuggestion = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt" });
    const narrowSuggestionResolved = await fixture.service.resolve({ ...resolveInput(narrowSuggestion.grantId), purpose: "diagnose_and_adapt" });
    await expect(narrowSuggestionResolved.provider.runTask({ ...request(), taskKind: "instruction_suggestion", expectedOutput: "instruction_suggestion" })).rejects.toThrow("request mismatch");

    // An exploration grant is bound to an exact Flow settings revision and to
    // the same absolute call backstop as every other grant.
    fixture.exactBinding = false;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "explore_and_adapt" })).rejects.toThrow("settings revision");
    fixture.exactBinding = true;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "explore_and_adapt", maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS + 1 })).rejects.toThrow("call limit");
  });

  it("inspects an available revision-bound build grant without claiming or revealing it", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    const revealCountBeforeInspection = fixture.revealCount;

    const inspected = await fixture.service.inspectAvailable({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    });

    expect(inspected).toMatchObject({
      grantId: grant.grantId,
      purpose: "build_and_adapt",
      executionDigest: "execution-digest.one",
      settingsRevision: 7,
      remainingUses: 2
    });
    expect(fixture.revealCount).toBe(revealCountBeforeInspection);
    expect(fixture.service.activeGrantCount()).toBe(1);
    await expect(fixture.service.resolve({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    })).resolves.toBeDefined();
    await expect(fixture.service.inspectAvailable({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    })).rejects.toThrow("unavailable");

    const wrongPurposeGrant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 1 });
    await expect(fixture.service.inspectAvailable({
      ...resolveInput(wrongPurposeGrant.grantId),
      purpose: "diagnosis_only"
    })).rejects.toThrow("scope mismatch");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });
  it("rejects concurrent build calls atomically and invalidates on settings drift, cancellation, user, and session", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.delayReveal = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.2 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    const pending = resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await fixture.revealStarted;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.concurrent", idempotencyKey: "request.concurrent", maxEstimatedCostUsd: 0.1 })).rejects.toThrow("call in progress");
    fixture.releaseReveal();
    await expect(pending).resolves.toBeDefined();

    fixture.delayReveal = false;
    fixture.settingsRevision += 1;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.drift", idempotencyKey: "request.drift", maxEstimatedCostUsd: 0.1 })).rejects.toThrow("no longer valid");
    fixture.settingsRevision -= 1;

    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.cancel(grant.grantId);
    expect(fixture.service.activeGrantCount()).toBe(0);
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.revokeForUser("user.one");
    expect(fixture.service.activeGrantCount()).toBe(0);
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.revokeForSession("session.one");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("authorizes flow_bootstrap only for build_and_adapt", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const buildGrant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 1 });
    const build = await fixture.service.resolve({ ...resolveInput(buildGrant.grantId), purpose: "build_and_adapt" });
    await expect(build.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toMatchObject({ code: "llm.provider_request_task_mismatch" });

    const diagnosisGrant = await fixture.service.issue(issueInput());
    const diagnosis = await fixture.service.resolve(resolveInput(diagnosisGrant.grantId));
    await expect(diagnosis.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toThrow("request mismatch");
  });

  it("supports a production bootstrap-only resolve policy while later adaptation tasks remain gated", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" }, { allowedTaskKinds: ["flow_bootstrap"] });
    await expect(resolved.provider.runTask(request())).rejects.toThrow("request mismatch");

    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" }, { allowedTaskKinds: ["flow_bootstrap"] });
    await expect(resolved.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toMatchObject({ code: "llm.provider_request_task_mismatch" });
  });

  it("rejects arbitrary runtime purposes before they can obtain build permissions or bypass revision binding", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "arbitrary_authoring" as any })).rejects.toThrow("purpose is unsupported");
    const grant = await fixture.service.issue(issueInput());
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "arbitrary_authoring" as any })).rejects.toThrow("purpose is unsupported");
  });

  it("does not commit a revealed in-flight result after cancellation, expiry, or dependency/settings drift", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    fixture.delayProvider = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    let pending = resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    expect(fixture.revealCount).toBe(1);
    fixture.service.cancel(grant.grantId);
    await expect(pending).rejects.toThrow();
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.releaseProvider();

    vi.useFakeTimers();
    fixture.now = 1;
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, ttlMs: 1000, maxEstimatedCostUsd: 0.1 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    // The claim window passing does not end a run that has claimed the grant.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.service.activeGrantCount()).toBe(1);
    // The run lease does: a call still in flight when it ends is aborted as a
    // timeout and its result is never committed.
    const lateInLease = AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS - 5_000;
    await vi.advanceTimersByTimeAsync(lateInLease - 1000);
    fixture.now = 1 + lateInLease;
    fixture.delayProvider = true;
    pending = resolved.provider.runTask({ ...request(), requestId: "request.expiry", idempotencyKey: "request.expiry", maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    const expiryRejection = expect(pending).rejects.toMatchObject({ code: "llm.provider_timeout" });
    await vi.advanceTimersByTimeAsync(5_000);
    await expiryRejection;
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.releaseProvider();
    vi.useRealTimers();

    fixture.delayProvider = true;
    fixture.now = 1;
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    pending = resolved.provider.runTask({ ...request(), requestId: "request.drift-after-reveal", idempotencyKey: "request.drift-after-reveal", maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    fixture.executionDigest = "execution-digest.changed";
    fixture.settingsRevision += 1;
    fixture.releaseProvider();
    await expect(pending).rejects.toThrow("no longer valid");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("fails build_and_adapt closed without an exact settings revision and rejects unsafe limits or retries", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt" })).rejects.toThrow("settings revision");
    fixture.exactBinding = true;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS + 1 })).rejects.toThrow("call limit");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", providerRetryCount: 1 })).rejects.toThrow("retries");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", maxTotalEstimatedCostUsd: Number.POSITIVE_INFINITY })).rejects.toThrow("total estimated-cost");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", tokenLimits: { maxTotalTokens: 64_001 } })).rejects.toThrow("token limits");
  });

  it("accepts authenticated sessions regardless of credential-configuration metadata and rejects incompatible provider metadata", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", provider: "other" })).rejects.toThrow("provider");
    await expect(fixture.service.issue({ ...issueInput(), maxUses: 2 })).rejects.toThrow("one-use");
    fixture.pinConfigured = false;
    await expect(fixture.service.issue(issueInput())).resolves.toMatchObject({ remainingUses: 1 });
  });

  // What a person gets when they authorize an adaptation and name no numbers:
  // enough calls for the recovery's own guards to be what stops it, a run token
  // budget that sits exactly at the confirmation threshold, $2.00, and no
  // high-token prompt.
  //
  // The per-call limits are deepseek-flash's own 64k context, less room for the
  // reply: 48,000 in, 8,000 out, 56,000 together. They were 8,000/2,000/10,000,
  // at which describing a real page did not fit and the input guard ended the
  // grant before a request was sent. The run budget is 26 x 56,000 held to the
  // confirmation threshold, and the threshold is ten of those calls: it used to
  // be a fixed 100,000, which beside a 56,000-token call was under two calls'
  // worth and left a default recovery no room to explore at all.
  it.each(["diagnose_and_adapt", "explore_and_adapt", "build_and_adapt"] as const)(`issues a default %s grant as 26 calls, ${THRESHOLD_LABEL} tokens and $2.00, with no confirmation`, async (purpose) => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose });
    expect(grant).toMatchObject({
      purpose,
      maxCalls: 26,
      remainingUses: 26,
      maxTotalTokensPerRun: THRESHOLD,
      maxEstimatedCostUsd: 0.25,
      maxTotalEstimatedCostUsd: 2,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }
    });
    // Ten full calls, so the threshold still means what it was written to mean.
    expect(THRESHOLD).toBe(grant.tokenLimits.maxTotalTokens * 10);
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS).toBe(26);
    expect(fixture.revealAuthorizationCount).toBe(26);
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose });
    expect(resolved).toMatchObject({ maxCallsPerRun: 26, maxTotalTokensPerRun: THRESHOLD, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 });
    fixture.service.close();
  });

  /** What one call of the run-budget example may spend: `request()`'s own limits. */
  const perCallLimits = { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };

  // The grant enforces the token budget it was issued with, whoever holds it --
  // a recovery's own ledger refuses first, but a Flow Bootstrap has no ledger.
  // Calls are charged what they reported, so the budget bounds real spending.
  it("refuses a call whose worst case would cross the run's token budget, charging what earlier calls reported", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.usage = { prompt_tokens: 6_000, completion_tokens: 2_000, total_tokens: 8_000 };
    // The per-call ceiling is named rather than defaulted. A run budget may
    // never be below one call's ceiling, and the default is now 56,000, which
    // would swamp a three-call example. This is what `request()` asks for, so it
    // is also what each call here is charged. The property is the run budget.
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", tokenLimits: perCallLimits, maxTotalTokensPerRun: 25_000 });
    expect(grant.maxTotalTokensPerRun).toBe(25_000);
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.t1", idempotencyKey: "request.t1" })).resolves.toBeDefined();
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.t2", idempotencyKey: "request.t2" })).resolves.toBeDefined();
    // 16,000 used, and the next call could use 10,000: 26,000 > 25,000.
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.t3", idempotencyKey: "request.t3" })).rejects.toThrow("total token limit");
    expect(fixture.revealCount).toBe(2);
    expect(fixture.service.activeGrantCount()).toBe(0);

    // Small replies leave room for many calls under the same budget.
    fixture.usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    const roomy = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", tokenLimits: perCallLimits, maxTotalTokensPerRun: 25_000 });
    const roomyResolved = await fixture.service.resolve({ ...resolveInput(roomy.grantId), purpose: "diagnose_and_adapt" });
    for (let index = 0; index < 10; index += 1) {
      await expect(roomyResolved.provider.runTask({ ...request(), requestId: `request.r${index}`, idempotencyKey: `request.r${index}`, maxEstimatedCostUsd: 2 / 26 })).resolves.toBeDefined();
    }
    fixture.service.close();
  });
});
