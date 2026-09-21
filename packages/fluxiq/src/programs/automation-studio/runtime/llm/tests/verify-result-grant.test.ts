import { describe, expect, it } from "vitest";
import type { AutomationStudioRuntimeAdaptationContext } from "../../service.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { automationStudioLlmExecutionGrantFixedCalls, automationStudioLlmExecutionGrantIterates, automationStudioLlmExecutionGrantTaskKinds, parseAutomationStudioLlmExecutionGrantPurpose } from "../grant-capabilities.ts";
import {
  AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES,
  automationStudioRuntimeAdaptationContextForGrant,
  automationStudioRuntimeSessionGrantTaskKinds
} from "../runtime-session-grant.ts";
import { issueInput, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

// The grant that lets a finished run's result be judged, and nothing else.
//
// Every provider call needs a person's grant, and a run with none could never
// have its result judged: on 2026-09-18 seven newly built Flows returned the
// wrong records and reported `passed`, because their runs carried no grant
// and the one verification call was never made. `verify_result` authorizes
// that call, and its one repeat, and nothing a recovery could spend a grant on.
// The repeat exists because a `does not answer` fails a run whose every step
// succeeded, and at temperature 0 one was measured to flip on identical rows.

function verificationRequest(): AutomationStudioLlmTaskRequest {
  const base = request();
  return { ...base, requestId: "request.verify", idempotencyKey: "request.verify", taskKind: "loop_verification", expectedOutput: "diagnosis", context: { ...base.context, taskKind: "loop_verification" } };
}

describe("the verify_result grant", () => {
  it("is a purpose a runtime session accepts, authorizing only the verification call", () => {
    expect(parseAutomationStudioLlmExecutionGrantPurpose("verify_result")).toBe("verify_result");
    expect(AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES).toContain("verify_result");
    expect(automationStudioLlmExecutionGrantTaskKinds("verify_result")).toEqual(["loop_verification"]);
    expect(automationStudioRuntimeSessionGrantTaskKinds("verify_result")).toEqual(["loop_verification"]);
  });

  it("makes at most two calls, never a loop, and may be asked for one", async () => {
    expect(automationStudioLlmExecutionGrantIterates("verify_result")).toBe(false);
    expect(automationStudioLlmExecutionGrantFixedCalls("verify_result")).toBe(2);
    const fixture = setup();
    fixture.exactBinding = true;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "verify_result", maxCalls: 3 })).rejects.toThrow("verify_result permits one LLM call or 2.");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "verify_result", maxCalls: 26 })).rejects.toThrow("verify_result permits one LLM call or 2.");
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "verify_result" });
    expect(grant).toMatchObject({ purpose: "verify_result", maxCalls: 2, remainingUses: 2 });
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "verify_result", maxCalls: 1 })).resolves.toMatchObject({ maxCalls: 1 });
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "verify_result", maxCalls: 2 })).resolves.toMatchObject({ maxCalls: 2 });
  });

  it("leaves diagnosis_only at exactly one call", async () => {
    expect(automationStudioLlmExecutionGrantFixedCalls("diagnosis_only")).toBe(1);
    const fixture = setup();
    fixture.exactBinding = true;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "diagnosis_only", maxCalls: 2 })).rejects.toThrow("diagnosis_only permits exactly one LLM call.");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "diagnosis_only" })).resolves.toMatchObject({ maxCalls: 1 });
  });

  it("answers a refutation's repeat under the same grant, and nothing after it", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.script.push({ kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no" } });
    fixture.script.push({ kind: "diagnosis", summary: "Judged again.", diagnosis: { answersRequest: "yes" } });
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "verify_result" });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "verify_result" }, { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("verify_result") });
    expect(resolved.maxCallsPerRun).toBe(2);
    await expect(resolved.provider.runTask(verificationRequest())).resolves.toMatchObject({ response: { diagnosis: { answersRequest: "no" } } });
    await expect(resolved.provider.runTask({ ...verificationRequest(), requestId: "request.verify.2", idempotencyKey: "request.verify.2" })).resolves.toMatchObject({ response: { diagnosis: { answersRequest: "yes" } } });
    await expect(resolved.provider.runTask({ ...verificationRequest(), requestId: "request.verify.3", idempotencyKey: "request.verify.3" })).rejects.toThrow();
  });

  it("answers the verification call, and refuses a diagnosis under the same grant", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.script.push({ kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no" } });
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "verify_result" });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "verify_result" }, { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("verify_result") });
    await expect(resolved.provider.runTask(verificationRequest())).resolves.toMatchObject({ response: { kind: "diagnosis", diagnosis: { answersRequest: "no" } } });

    const other = await fixture.service.issue({ ...issueInput(), purpose: "verify_result" });
    const refused = await fixture.service.resolve({ ...resolveInput(other.grantId), purpose: "verify_result" }, { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("verify_result") });
    await expect(refused.provider.runTask(request())).rejects.toThrow("mismatch");
  });

  it("leaves the run itself deterministic: no diagnosis, no adaptation, recovery as configured", () => {
    const context = {
      behavior: { invokeLlm: true, runRecovery: true, createAdaptations: true, promoteAdaptations: true },
      policy: { proposalMode: "auto" },
      diagnostics: []
    } as unknown as AutomationStudioRuntimeAdaptationContext;
    const granted = automationStudioRuntimeAdaptationContextForGrant(context, "verify_result");
    expect(granted.behavior).toEqual({ invokeLlm: false, runRecovery: true, createAdaptations: false, promoteAdaptations: false });
    expect(granted.policy).toBe(context.policy);
  });
});
