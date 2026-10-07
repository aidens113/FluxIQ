// The candidate trial through the actual service (t340): a scripted model
// submits, tests and completes; the service's trial runner runs the candidate
// in a session of its own and the real build-test judge is asked over the
// mock provider. Every promotion refusal keeps the draft and proposes nothing.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import type { AutomationStudioFlowCandidateDraftStore } from "../../candidate-drafts/index.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

type Judged = "yes" | "no" | "unknown" | "silent";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

function draftStore(service: AutomationStudioService) { return (service as unknown as { candidateDrafts: AutomationStudioFlowCandidateDraftStore }).candidateDrafts; }
async function adaptations(service: AutomationStudioService, projectId: string, flowId: string): Promise<unknown[]> { return await (service as any).bootstrapAdaptations.listFlowBootstrapAdaptations(projectId, flowId); }

/** One candidate build: explore once, submit, test, then complete until the build ends. */
async function candidateBuild(options: { judge?: Judged[]; maxCallsPerRun?: number; service?: Partial<AutomationStudioServiceOptions> } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-trial-facade-"));
  const judgeRequests: AutomationStudioLlmTaskRequest[] = [];
  const judged = options.judge ?? ["yes", "yes"];
  let decisions = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") {
      const reply = judged[judgeRequests.length] ?? "unknown";
      judgeRequests.push(request);
      return reply === "silent" ? { response: { kind: "diagnosis", summary: "Judged.", diagnosis: {} }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.0001 } } : judgeReply(reply);
    }
    decisions++;
    const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    const decision = decisions === 1 ? { kind: "tool_call", callId: "wrong-turn", toolId: "inspect", input: { area: "exploration-only" } }
      : decisions === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "Start to End", plan: plan() } }
      : decisions === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } };
    return { response: { kind: "evidence_tool_decision", summary: "Scripted", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: options.maxCallsPerRun ?? 12, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seenOnlyWhileExploring: "exploration-marker", leftover: true }, effectApplied: false, targetsUnchanged: true }) },
    ...options.service });
  cleanups.push(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const { project, flow } = await blankFixture(service);
  const proposed = vi.spyOn(service, "createFlowBootstrapAdaptation");
  return { service, projectId: project.id, flowId: flow.flowId, judgeRequests, proposed, decisions: () => decisions,
    build: () => service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" }) };
}

describe("a candidate trial through the actual service", () => {
  it.each(["no start hook", "a start hook"] as const)("with %s, the judge is shown only the trial run, never exploration's leftovers", async (hooked) => {
    const resets: string[] = [];
    const run = await candidateBuild(hooked === "a start hook" ? { service: { prepareCandidateStart: async (input) => { resets.push(`${input.candidateId}@${input.revision}`); return { fixture: "reset" }; } } } : {});
    const activity: { kind: string; phase: string; label: string }[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => { activity.push({ kind: event.subject.kind, phase: event.phase, label: event.label }); });
    const result = await run.build().finally(unsubscribe);
    // The trial's steps reach the chat as rows of the build's own activity: no run of its own is announced (U3 decides whether to wrap the trial as a run).
    expect(activity.filter((event) => event.kind === "build" && event.label.startsWith("Running step")).length).toBeGreaterThan(0);
    expect(activity.filter((event) => event.kind === "run")).toEqual([]);
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${result.status}`);
    expect(run.judgeRequests).toHaveLength(2);
    for (const request of run.judgeRequests) {
      const sent = JSON.stringify(request.context);
      expect(sent).not.toContain("exploration-marker"); expect(sent).not.toContain("leftover"); expect(sent).not.toContain("wrong-turn");
      expect(sent).toContain("builtin.control.start"); expect(sent).toContain("builtin.control.end");
    }
    const session = await run.service.getRuntimeSession(run.projectId, result.candidate!.trial.runId);
    expect(session).toMatchObject({ status: "succeeded", flowId: run.flowId, trace: { status: "succeeded" }, metadata: { candidateTrial: { candidateId: result.candidate!.candidateId, revision: 1, start: hooked === "a start hook" ? "reset" : "not_reset", execution: "succeeded" } } });
    expect(resets).toEqual(hooked === "a start hook" ? [`${result.candidate!.candidateId}@1`] : []);
    // Readiness says the trial runner is there, and whether the deployment resets the target before each trial (U4 reads it).
    expect(run.service.getFlowBootstrapGenerationRuntimeReadiness().candidateTrial).toEqual({ runner: true, startReset: hooked === "a start hook" });
  });

  it.each([["unknown"], ["silent"], ["no"]] as const)("a first yes followed by %s gives no adaptation", async (second) => {
    const run = await candidateBuild({ judge: ["yes", second], maxCallsPerRun: 8 });
    await expect(run.build()).rejects.toThrow();
    expect(run.judgeRequests).toHaveLength(2);
    expect(run.proposed).not.toHaveBeenCalled();
    expect(await adaptations(run.service, run.projectId, run.flowId)).toEqual([]);
    expect(await run.service.getFlowRouter(run.projectId, run.flowId)).toBeNull();
  });

  it("an instruction edited between the trial and the promotion gives FLOW_BOOTSTRAP_STALE and keeps the draft", async () => {
    const run = await candidateBuild();
    const store = draftStore(run.service), save = store.save.bind(store);
    vi.spyOn(store, "save").mockImplementation(async (record, signal) => {
      const saved = await save(record, signal);
      const instruction = (await run.service.getFlowInstruction(run.projectId, "instruction.build"))!;
      await run.service.saveFlowInstruction(run.projectId, { ...instruction, body: "Create a different Flow.", updatedAt: Date.now() + 1 });
      return saved;
    });
    const result = await run.build();
    expect(result).toMatchObject({ status: "draft", verification: "not_performed", promotionAllowed: false, trial: { verdict: "yes", codes: ["FLOW_BOOTSTRAP_STALE"] } });
    if (result.status !== "draft") throw new Error("expected a draft");
    expect(await store.get(run.projectId, run.flowId)).toMatchObject({ candidateId: result.candidateId, candidate: { revision: 1, digest: result.digest } });
    expect(run.proposed).not.toHaveBeenCalled();
    expect(await adaptations(run.service, run.projectId, run.flowId)).toEqual([]);
  });

  it("an authoritative draft whose digest is not the trial's is refused", async () => {
    const run = await candidateBuild();
    const store = draftStore(run.service), read = store.getAuthoritative.bind(store);
    vi.spyOn(store, "getAuthoritative").mockImplementation(async (projectId, flowId) => {
      const stored = structuredClone(await read(projectId, flowId));
      if (stored) stored.candidate.buildPlan.plan.subflows[0]!.name = "Swapped after the trial";
      return stored;
    });
    const result = await run.build();
    expect(result).toMatchObject({ status: "draft", trial: { verdict: "yes", codes: ["candidate.promotion_digest_mismatch"] } });
    expect(run.proposed).not.toHaveBeenCalled();
    expect(await adaptations(run.service, run.projectId, run.flowId)).toEqual([]);
  });

  it("a cancelled trial asks no judge and promotes nothing", async () => {
    let run!: Awaited<ReturnType<typeof candidateBuild>>;
    run = await candidateBuild({ service: { prepareCandidateStart: async () => { run.service.buildCancellation.cancel(run.projectId, run.flowId); return { fixture: "reset" }; } } });
    await expect(run.build()).rejects.toMatchObject({ name: "AbortError" });
    expect(run.judgeRequests).toEqual([]);
    expect(run.proposed).not.toHaveBeenCalled();
    expect(await adaptations(run.service, run.projectId, run.flowId)).toEqual([]);
    expect(await draftStore(run.service).get(run.projectId, run.flowId)).toBeUndefined();
  });
});
