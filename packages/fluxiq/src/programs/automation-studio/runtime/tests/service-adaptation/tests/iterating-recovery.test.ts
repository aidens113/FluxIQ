// A runtime recovery that asks to look before it answers.
//
// Twice against the real provider, a run a person asked for got as far as a
// staged diagnosis and no further: the model's first move was to ask for more
// evidence, the one call that could serve that request was forbidden to the
// grant a runtime session then had to carry, and the recovery ended with
// `validationOk: false` while its scenario still passed.
//
// These tests drive that exact sequence end to end: a failed run, the host's
// own session-key resolver (no grant: the caller's key, released per call), the
// real DeepSeek provider contract behind a scripted endpoint, and the
// task-kind policy the host binds for a recovery. The script asks to gather
// before it answers, and the recovery has to complete.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  createAutomationStudioSessionKeyProviderResolver,
  type AutomationStudioLlmRunCallRecord,
  type AutomationStudioRuntimeSessionLlmIntent
} from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata, createFailingCanonicalFlow } from "../../service-fixtures.ts";

// Heavy service test: under full-suite load it ran past the 15 s default (t289).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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
  it.each(["diagnose_and_adapt", "explore_and_adapt"] as const)("completes a %s recovery that stages a diagnosis, gathers evidence and then answers, with no grant", async (intent) => {
    const fixture = await recoveryFixture(intent);

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
    // Four calls, past the two a grant used to pin a recovery at, each on the
    // caller's own key released for that call alone: nothing issued or held.
    expect(fixture.reveals()).toEqual(Array.from({ length: 4 }, () => ({ userId: "user.one", sessionId: "session.one" })));
    expect(run.status).toBe("failed");
  }, 60_000);

  it("runs a model run whatever its intent, its dry-run flag or its side-effect authorization", async () => {
    // A run's intent is not a statement about how it may execute: what stays
    // gated is a lasting real-world consequence, one action at a time, by
    // `permittedConsequences` and the action permission gate. A build's intent
    // is the entry point a Flow built from an instruction runs under, and a
    // verification that "changes nothing" may still act on a page.
    const service = track(new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }));
    const project = await service.createProject({ name: "Any intent" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.any-intent", metadata: adaptiveTrainingMetadata() });
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent: "build_and_adapt" }
    })).resolves.toMatchObject({ flowId: flow.flowId });
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      dryRunLlm: true,
      llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent: "explore_and_adapt" }
    })).resolves.toMatchObject({ flowId: flow.flowId });
    await expect(service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      authorizedExternalSideEffects: true,
      llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent: "diagnosis_only" }
    })).resolves.toMatchObject({ flowId: flow.flowId });
  });
});

function track(service: AutomationStudioService): AutomationStudioService {
  services.add(service);
  return service;
}

/**
 * One project, one failing Flow, and one service wired to the session-key
 * resolver the way the host wires it, with the provider's replies scripted.
 *
 * The domain here captures no failure evidence. The recovery exploration
 * currently forwards captured failure evidence into its `evidence_tool_decision`
 * request, which the context packet refuses for that task kind, so a domain
 * that captures evidence has every exploration end in `invalid_decision`
 * before a provider is called. That is a separate defect in
 * `recovery/annotation/exploration.ts`, reported rather than papered over here.
 */
async function recoveryFixture(intent: AutomationStudioRuntimeSessionLlmIntent) {
  const replies = Object.fromEntries(Object.entries(GATHER_THEN_ANSWER).map(([taskKind, list]) => [taskKind, [...list]]));
  const taskKinds: string[] = [];
  const toolCalls: Array<{ toolId: string; callId: string }> = [];
  const reveals: Array<{ userId: string; sessionId: string }> = [];
  const service = track(new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The host's own composition: the caller's key resolves the provider for
    // the whole diagnosis, evidence, repair and verification loop, whatever its
    // intent. Nothing is issued before the run or revoked after it.
    llmProviderResolver: createAutomationStudioSessionKeyProviderResolver({
      ports: {
        snapshot: async () => ({ keys: [{ id: "secret:key", kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1 }] }),
        createSessionRevealAuthorization: async (input) => {
          reveals.push({ userId: input.userId, sessionId: input.sessionId });
          return { authorizationId: `secret-reveal:${reveals.length}`, keyId: input.id, keyUpdatedAtMs: 1 };
        },
        revealKeyWithAuthorization: async () => ({ value: "test-provider-secret" }),
        revokeRevealAuthorization: () => undefined
      },
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
    }),
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
  const project = await service.createProject({ name: `Iterating recovery ${intent}` });
  const flow = await createFailingCanonicalFlow(service, project.id, { flowId: `flow.iterating-${intent.replaceAll("_", "-")}`, metadata: adaptiveTrainingMetadata() });
  return {
    taskKinds,
    toolCalls,
    reveals: () => reveals,
    unusedReplies: () => Object.values(replies).flat(),
    run: async () => {
      const run = await service!.runRuntimeSession({
        projectId: project.id,
        flowId: flow.flowId,
        inputs: { numerator: 1, denominator: 0 },
        llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent }
      });
      const detail = await service!.getFlowRunDetail(project.id, run.runId);
      return { run, detail };
    }
  };
}
