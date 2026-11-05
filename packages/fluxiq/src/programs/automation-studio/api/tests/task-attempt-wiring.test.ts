// @fluxiq-test-group real-sql
// What t869 wired onto the attempt road, through a real service and registry: the Flow a task already
// has, a person's read of a row whose Core died, the carry-on press, and an attempt's provenance.
// The attempt itself is stubbed where `service.generateFlowBootstrapAdaptation` runs it.

import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstAttemptStoreOf } from "../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstTaskKey, automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemory } from "../../../../framework/automation-service/service/answer-first/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS } from "../../../../framework/automation-service/service/answer-first/carry-on/index.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";
import { createCacheApiTestService } from "../handlers/tests/test-service.ts";

const ACTOR: ProgramApiActor = { sessionId: "client-gateway:session.1", userId: "user.person", roleId: "role.owner", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"], channel: "paired-client" };
const TRIED = { version: 1 as const, tried: [], approaches: 0 };
const TEXT = "List my loans";
const WHERE = "https://library.example/account";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function world() {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const project = await service.createProject({ name: "Wiring" });
  const flow = await service.createFlow({ projectId: project.id, name: "Loans" });
  const store = automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
  const memory = automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: ACTOR, payload }) as Promise<{ ok: boolean; payload?: any; error?: string; errorCode?: string }>;
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: TEXT, startLocation: WHERE });
  const attempt = (status: AutomationStudioTaskAttempt["status"], attemptId = "attempt.1", extra: Record<string, unknown> = {}): AutomationStudioTaskAttempt => ({
    taskId, attemptId, ordinal: 1, projectId: project.id, flowId: flow.flowId, runId: `explore.${attemptId}`, path: "explore", status,
    spend: { calls: 3, inputTokens: 100, outputTokens: 50, usd: 0.42, ms: 900 }, budget: { usd: 0.5 }, liveSteps: 2, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1_000,
    ...(status === "working" ? {} : { endedAtMs: 1_900 }), ...extra
  }) as AutomationStudioTaskAttempt;
  const remember = (attempts: unknown[], over: Record<string, unknown> = {}) => memory.update(project.id, taskId, (current) => ({ ...current, flowId: flow.flowId, attempts: attempts as AutomationStudioAnswerFirstTaskMemory["attempts"], ...over }));
  return { service, project, flow, store, memory, call, taskId, attempt, remember };
}

describe("get-task-known-flow", () => {
  const saved = (flowId: string) => ({ attemptId: "attempt.1", flowId, steps: [], stepsDigest: "digest", label: "confirmed" as const, provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.1 } });

  it("answers the Flow an identical task lives under, and none for another task or another site", async () => {
    const { project, flow, call, remember } = await world();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, instructionText: TEXT, startLocation: WHERE })).toEqual({ ok: true, payload: {} });
    await remember([], { latest: saved(flow.flowId) });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, instructionText: `  ${TEXT}  `, startLocation: WHERE })).toEqual({ ok: true, payload: { flowId: flow.flowId } });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, instructionText: "List my holds", startLocation: WHERE })).toEqual({ ok: true, payload: {} });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, instructionText: TEXT, startLocation: "https://other.example/" })).toEqual({ ok: true, payload: {} });
  });

  it("answers none, and does not fail, when the Flow is gone", async () => {
    const { project, call, remember } = await world();
    await remember([], { flowId: "flow.gone", latest: saved("flow.gone") });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, instructionText: TEXT, startLocation: WHERE })).toEqual({ ok: true, payload: {} });
  });
});

describe("a person's read of a row whose Core died", () => {
  it("reads as interrupted by attempt and by thread, never as still working", async () => {
    const { project, flow, store, call, attempt } = await world();
    await store.locator.noteConversation(project.id, "conversation.1", flow.flowId);
    await store.save(project.id, flow.flowId, { attempt: attempt("working", "attempt.1", { startedAtMs: Date.now() }), tried: TRIED });
    const one = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.1" });
    expect(one.error).toBeUndefined();
    expect(one.payload.outcome.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted" });
    const listed = await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" });
    expect(listed.payload.outcomes.map((each: { attempt: { status: string } }) => each.attempt.status)).toEqual(["waiting_for_person"]);
  });
});

describe("provenance", () => {
  it("is told in a person's words where the task remembers the attempt, and absent where it does not", async () => {
    const { project, flow, store, call, attempt, remember } = await world();
    await store.save(project.id, flow.flowId, { attempt: attempt("stopped_by_person", "attempt.1"), tried: TRIED });
    await store.save(project.id, flow.flowId, { attempt: attempt("stopped_by_person", "attempt.2", { ordinal: 2 }), tried: TRIED });
    await remember([{ attemptId: "attempt.1", flowId: flow.flowId, ordinal: 1, route: "repair", startedFrom: { attemptId: "attempt.0", flowId: flow.flowId, stepsDigest: "d", steps: 2, notes: 0, provenWhole: false }, steps: [{ position: 1, label: "Open loans", from: "saved", ran: "passed" }, { position: 2, from: "worked_out", ran: "not_reached" }] }]);
    const one = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.1" });
    expect(one.error).toBeUndefined();
    expect(one.payload.outcome.provenance).toEqual({ route: "repaired the Flow it had saved", startedFrom: "a saved Flow of 2 steps", steps: [{ position: 1, label: "Open loans", from: "saved", ran: true }, { position: 2, label: "Step 2", from: "worked_out", ran: false }] });
    const none = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.2" });
    expect(none.payload.outcome).not.toHaveProperty("provenance");
  });
});

describe("carry-on-task-attempt", () => {
  /** The attempt stubbed where it runs; `fail` makes the run reject. */
  function stubbed(service: Awaited<ReturnType<typeof world>>["service"], fail = false) {
    const asked: Array<Record<string, unknown>> = [];
    service.getFlowBootstrapGenerationRuntimeReadiness = (() => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true, llmEvidenceRuntime: { bound: true, toolCount: 1, readRowsBound: true } })) as unknown as typeof service.getFlowBootstrapGenerationRuntimeReadiness;
    service.generateFlowBootstrapAdaptation = (async (input: Record<string, unknown>) => {
      asked.push(input);
      if (fail) throw new Error("The model went away.");
      return { projectId: input.projectId, flowId: input.flowId, status: "answered", sourceInstructionIds: [], baseDependencyDigest: "digest", baseSettingsRevision: 1, accounting: {} };
    }) as unknown as typeof service.generateFlowBootstrapAdaptation;
    return asked;
  }

  async function budgetedOut() {
    const lane = await world();
    await lane.store.save(lane.project.id, lane.flow.flowId, { attempt: lane.attempt("budget_out"), tried: TRIED });
    await lane.remember([{ attemptId: "attempt.1", flowId: lane.flow.flowId, ordinal: 1, route: "build", steps: [] }]);
    return lane;
  }

  it("answers at once, and goes on through the generation path with no new request fields", async () => {
    const lane = await budgetedOut();
    const asked = stubbed(lane.service);
    const answer = await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.1", addUsd: 0.5 });
    expect(answer).toEqual({ ok: true, payload: { attemptId: "attempt.1", budgetUsd: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ projectId: lane.project.id, flowId: lane.flow.flowId, authoringMode: "answer-first", evidenceGuided: true, caller: { actorUserId: "user.person", actorSessionId: "client-gateway:session.1" } });
  });

  it("a paired press runs under the person's unlocked session, as the chat's commands do, and keeps the paired one with nothing unlocked", async () => {
    const lane = await budgetedOut();
    const asked = stubbed(lane.service);
    lane.service.conversations.bindUnlockedSessionResolver((userId) => (userId === "user.person" ? "session.unlocked" : null));
    expect((await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.1", addUsd: 0.5 })).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked[0]).toMatchObject({ caller: { actorUserId: "user.person", actorSessionId: "session.unlocked" } });

    const locked = await budgetedOut();
    const lockedAsked = stubbed(locked.service);
    locked.service.conversations.bindUnlockedSessionResolver(() => null);
    expect((await locked.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: locked.project.id, attemptId: "attempt.1", addUsd: 0.5 })).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lockedAsked[0]).toMatchObject({ caller: { actorSessionId: "client-gateway:session.1" } });
  });

  it("carries on an interrupted attempt with no budget added", async () => {
    const lane = await world();
    await lane.store.save(lane.project.id, lane.flow.flowId, { attempt: lane.attempt("working"), tried: TRIED });
    await lane.remember([{ attemptId: "attempt.1", flowId: lane.flow.flowId, ordinal: 1, route: "build", steps: [] }]);
    stubbed(lane.service);
    const answer = await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.1", addUsd: 0 });
    expect(answer).toEqual({ ok: true, payload: { attemptId: "attempt.1", budgetUsd: 0.5 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("refuses in Core's own sentence, and starts nothing", async () => {
    const lane = await budgetedOut();
    const asked = stubbed(lane.service);
    const answer = await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.1", addUsd: 0 });
    expect(answer).toMatchObject({ ok: false, error: AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS.no_budget_added });
    expect(await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.none", addUsd: 1 })).toMatchObject({ ok: false, error: AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS.unknown_attempt });
    expect(asked).toEqual([]);
  });

  it("refuses fields it does not carry and an amount that is not a number of dollars", async () => {
    const lane = await budgetedOut();
    stubbed(lane.service);
    const base = { projectId: lane.project.id, attemptId: "attempt.1" };
    expect((await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { ...base, addUsd: 1, flowId: "flow.x" })).ok).toBe(false);
    expect((await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { ...base, addUsd: "1" })).ok).toBe(false);
    expect((await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { ...base, addUsd: -1 })).ok).toBe(false);
  });

  it("does not turn a run that fails into an unhandled rejection", async () => {
    const lane = await budgetedOut();
    stubbed(lane.service, true);
    const unhandled: unknown[] = [];
    const watch = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", watch);
    try {
      const answer = await lane.call(AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt, { projectId: lane.project.id, attemptId: "attempt.1", addUsd: 0.5 });
      expect(answer.ok).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off("unhandledRejection", watch);
    }
    expect(unhandled).toEqual([]);
  });
});
