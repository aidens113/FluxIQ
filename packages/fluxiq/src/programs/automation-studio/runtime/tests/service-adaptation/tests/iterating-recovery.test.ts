// A runtime recovery that asks to look before it answers.
//
// Twice against the real provider, a run under an explicit grant got as far as
// a staged diagnosis and no further: the model's first move was to ask for more
// evidence, the one call that could serve that request was forbidden to the
// grant a runtime session could carry, and the recovery ended with
// `validationOk: false` while its scenario still passed.
//
// These tests drive that exact sequence end to end: a failed run, the real
// grant service, the real DeepSeek provider contract behind a scripted
// endpoint, and the task-kind policy the host binds for a recovery. The script
// asks to gather before it answers, and the recovery has to complete.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AutomationStudioLlmExecutionGrantService,
  automationStudioRuntimeSessionGrantTaskKinds,
  type AutomationStudioLlmRunCallRecord,
  type AutomationStudioRuntimeSessionGrantPurpose
} from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata, createFailingCanonicalFlow } from "../../service-fixtures.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

/** What the scripted model says, per task kind, in the order it is asked. */
const GATHER_THEN_ANSWER: Record<string, JsonObject[]> = {
  runtime_diagnosis: [
    { kind: "diagnosis", summary: "The control moved; look at the form before changing anything.", diagnosis: { explorationNeeded: true, patchNeeded: true } }
  ],
  evidence_tool_decision: [
    { kind: "evidence_tool_decision", summary: "Inspect the form first.", decision: { kind: "tool_call", callId: "call.inspect.1", toolId: "inspect", input: {} } },
    { kind: "evidence_tool_decision", summary: "The replacement control is present.", decision: { kind: "complete", result: { findings: "The replacement control is on the form." } } }
  ],
  runtime_patch: [
    { kind: "runtime_patch", summary: "Use the observed replacement.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "divide", target: { handles: { control: "replacement" } }, reason: "Seen while gathering." }] }
  ]
};

describe("AutomationStudioService iterating recovery", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-iterating-recovery-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  // A whole failed run and four scripted calls: on a loaded machine this runs
  // well past the suite's 15-second default, hence its own timeout.
  it.each(["diagnose_and_adapt", "explore_and_adapt"] as const)("completes a %s recovery that stages a diagnosis, gathers evidence and then answers", async (purpose) => {
    const fixture = await recoveryFixture(purpose);

    const { run, detail } = await fixture.run();

    // The order the live run could never reach: diagnose, gather, gather, answer.
    expect(fixture.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(fixture.unusedReplies()).toEqual([]);
    expect(fixture.toolCalls).toEqual([{ toolId: "inspect", callId: "call.inspect.1" }]);
    // The staged diagnosis was followed by a gather that finished, not left as a guess.
    const stages = (detail?.metadata?.recoveryTrace as { stages?: Array<{ stage: string; status: string; detail?: JsonObject }> } | undefined)?.stages ?? [];
    expect(stages.find((stage) => stage.stage === "diagnosis")).toMatchObject({ status: "completed" });
    expect(stages.find((stage) => stage.stage === "exploration")).toMatchObject({ status: "completed", detail: { requested: true, outcome: "evidence_gathered" } });
    expect(detail?.metadata?.llmGate).toMatchObject({ invoked: true, ok: true, costAccounting: { calls: 4, explorationCalls: 2 } });
    // Every one of the four calls has its own line on the persisted run, in the
    // order made -- the two gathers included, which leave no intervention.
    const gate = detail?.metadata?.llmGate as unknown as { costAccounting: Record<string, number>; providerCalls: AutomationStudioLlmRunCallRecord[]; providerCallsOmitted: number };
    expect(gate.providerCallsOmitted).toBe(0);
    expect(gate.providerCalls.map((call) => [call.sequence, call.taskKind, call.stage, call.allowance, call.promptVersion])).toEqual([
      [1, "runtime_diagnosis", "gather", "run", "automation-studio.runtime-diagnosis.v1+stage.gather"],
      [2, "evidence_tool_decision", "gather", "exploration", "automation-studio.evidence-tool-decision.v1+stage.gather"],
      [3, "evidence_tool_decision", "gather", "exploration", "automation-studio.evidence-tool-decision.v1+stage.gather"],
      [4, "runtime_patch", "implement", "run", "automation-studio.runtime-patch.v1+stage.implement"]
    ]);
    for (const call of gate.providerCalls) {
      expect(call).toMatchObject({ provider: "deepseek", model: "deepseek-flash", validation: { ok: true, issueCodes: [] }, budgetBreach: false });
      expect(call.reported).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
      expect(call.charged).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15, tokens: "reported", cost: "reported" });
      expect(call.reported.estimatedCostUsd).toBe(call.charged.estimatedCostUsd);
    }
    // The first and last lines are the two model interventions' own requests.
    // (The run also carries the deterministic recovery's diagnosis, which asked
    // no provider and so has no request.)
    const interventionRequests = (detail?.interventions ?? []).flatMap((item) => item.metadata?.requestId ? [item.metadata.requestId] : []);
    expect([gate.providerCalls[0]?.requestId, gate.providerCalls[3]?.requestId]).toEqual(interventionRequests);
    expect(new Set(gate.providerCalls.map((call) => call.requestId)).size).toBe(4);
    // And the lines add up to the run's own totals, figure for figure.
    const sum = (key: "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd") => gate.providerCalls.reduce((total, call) => total + call.charged[key], 0);
    expect({ calls: gate.providerCalls.length, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens"), estimatedCostUsd: sum("estimatedCostUsd") })
      .toEqual({ calls: gate.costAccounting.calls, inputTokens: gate.costAccounting.inputTokens, outputTokens: gate.costAccounting.outputTokens, totalTokens: gate.costAccounting.totalTokens, estimatedCostUsd: gate.costAccounting.estimatedCostUsd });
    // And it answered, under manual review: nothing was applied on its own.
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ kind: "temporary_target_override" })]);
    expect(JSON.stringify(detail?.metadata?.runtimePatchAttempts)).not.toContain("\"autoApply\":true");
    // Four calls on one grant, past the two it used to be pinned at, and the
    // grant released when the run ended.
    expect(fixture.reveals()).toBe(4);
    expect(fixture.grants.activeGrantCount()).toBe(0);
    expect(run.status).toBe("failed");
  }, 60_000);

  it("refuses a runtime session purpose that is not a recovery, and incompatible flags on one that is", async () => {
    const service = track(new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }));
    const project = await service.createProject({ name: "Unsupported purpose" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.unsupported-purpose", metadata: adaptiveTrainingMetadata() });
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      llmExecution: { grantId: "grant.build", actorUserId: "user.one", actorSessionId: "session.one", purpose: "build_and_adapt" as never }
    })).rejects.toThrow("not one a runtime session runs under");
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      dryRunLlm: true,
      llmExecution: { grantId: "grant.explore", actorUserId: "user.one", actorSessionId: "session.one", purpose: "explore_and_adapt" }
    })).rejects.toThrow("cannot be an LLM dry run");
    // A purpose that only asks a question may not be handed the authority to act.
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      authorizedExternalSideEffects: true,
      llmExecution: { grantId: "grant.diagnose", actorUserId: "user.one", actorSessionId: "session.one", purpose: "diagnosis_only" }
    })).rejects.toThrow("cannot carry side-effect authorization");
  });
});

function track(service: AutomationStudioService): AutomationStudioService {
  services.add(service);
  return service;
}

/**
 * One project, one failing Flow, one real grant service and one service wired
 * to it the way the host wires them, with the provider's replies scripted.
 *
 * The domain here captures no failure evidence. The recovery exploration
 * currently forwards captured failure evidence into its `evidence_tool_decision`
 * request, which the context packet refuses for that task kind, so a domain
 * that captures evidence has every exploration end in `invalid_decision`
 * before a provider is called. That is a separate defect in
 * `recovery/annotation/exploration.ts`, reported rather than papered over here.
 */
async function recoveryFixture(purpose: AutomationStudioRuntimeSessionGrantPurpose) {
  const replies = Object.fromEntries(Object.entries(GATHER_THEN_ANSWER).map(([taskKind, list]) => [taskKind, [...list]]));
  const taskKinds: string[] = [];
  const toolCalls: Array<{ toolId: string; callId: string }> = [];
  let revealCount = 0;
  let authorizationCount = 0;
  let service: AutomationStudioService | undefined;
  const key = { id: "secret:key", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };
  const grants = new AutomationStudioLlmExecutionGrantService({
    resolveExecutionDigest: async (projectId, flowId) => service!.getLlmExecutionBinding(projectId, flowId),
    identityAccess: {
      validateSession: async () => ({ user: { id: "user.one", passwordConfigured: true, pinConfigured: true }, session: {}, role: {} })
    } as any,
    secretKeys: {
      getKeySummary: async () => ({ ...key }),
      createSessionRevealAuthorization: async (input: { ttlMs?: number; nowMs: number }) => {
        authorizationCount += 1;
        return { authorizationId: `secret-reveal:${authorizationCount}`, keyId: key.id, keyUpdatedAtMs: key.updatedAtMs, expiresAtMs: input.nowMs + (input.ttlMs ?? 60_000), remainingUses: 1 };
      },
      revealKeyWithAuthorization: async () => {
        revealCount += 1;
        return { key: { ...key }, value: "test-provider-secret" };
      },
      revokeRevealAuthorization: () => undefined
    } as any,
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role?: string; content?: string }> };
      const task = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as { taskKind?: string };
      const taskKind = String(task.taskKind);
      taskKinds.push(taskKind);
      const content = replies[taskKind]?.shift() ?? { kind: "unscripted" };
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  service = track(new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The host's own composition: the grant resolves the provider, and a
    // runtime recovery may spend it only on diagnosing, gathering and repairing.
    llmProviderResolver: (input) => input.executionGrant && input.executionGrant.purpose !== "build_and_adapt"
      ? grants.resolve(
        { ...input.executionGrant, projectId: input.projectId, flowId: input.flowId },
        { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds(input.executionGrant.purpose) }
      )
      : undefined,
    revokeLlmExecutionGrant: (grantId) => grants.revoke(grantId),
    closeLlmExecutionGrants: () => grants.close(),
    llmEvidenceRuntime: {
      domainId: "test.domain",
      deniedEvidenceKeys: ["html", "cookies", "headers"],
      tools: [{ toolId: "inspect", description: "Look at the live form.", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async (input) => {
        toolCalls.push({ toolId: input.toolId, callId: input.callId });
        return { kind: "llm_evidence_tool_execution", evidence: { control: "replacement" }, effectApplied: false };
      }
    }
  }));
  const project = await service.createProject({ name: `Iterating recovery ${purpose}` });
  const flow = await createFailingCanonicalFlow(service, project.id, { flowId: `flow.iterating-${purpose.replaceAll("_", "-")}`, metadata: adaptiveTrainingMetadata() });
  const grant = await grants.issue({
    actorUserId: "user.one",
    actorSessionId: "session.one",
    keyId: key.id,
    projectId: project.id,
    flowId: flow.flowId,
    provider: "deepseek",
    model: "deepseek-flash",
    purpose
  });
  return {
    grants,
    taskKinds,
    toolCalls,
    reveals: () => revealCount,
    unusedReplies: () => Object.values(replies).flat(),
    run: async () => {
      const run = await service!.runRuntimeSession({
        projectId: project.id,
        flowId: flow.flowId,
        inputs: { numerator: 1, denominator: 0 },
        llmExecution: { grantId: grant.grantId, actorUserId: "user.one", actorSessionId: "session.one", purpose }
      });
      const detail = await service!.getFlowRunDetail(project.id, run.runId);
      return { run, detail };
    }
  };
}
