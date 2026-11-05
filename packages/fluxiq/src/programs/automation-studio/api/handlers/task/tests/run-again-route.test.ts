// @fluxiq-test-group real-sql
// `run-task-again` through a real service and registry (t869): a person's press of Run again reaches
// the attempt it starts, by a scope only this route sets, with no field a model could write. The
// attempt itself is stubbed where `service.generateFlowBootstrapAdaptation` runs it; the attempt's own
// side is proven in `answer-first/tests/same-words.test.ts`. A lending library stands in.

import { afterEach, describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstRunAgainScope, automationStudioAnswerFirstTaskKey, automationStudioAnswerFirstTaskMemoryOf, AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS } from "../../../../../../framework/automation-service/service/answer-first/index.ts";
import { registerAutomationStudioApi } from "../../index.ts";
import { createCacheApiTestService } from "../../tests/test-service.ts";

const ACTOR: ProgramApiActor = { sessionId: "client-gateway:session.1", userId: "user.person", roleId: "role.owner", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"], channel: "paired-client" };
const TEXT = "List my loans";
const WHERE = "https://library.example/account";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function world(goal = TEXT) {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const project = await service.createProject({ name: "Run again" });
  const flow = await service.createFlow({ projectId: project.id, name: "Loans" });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.goal", title: "The task", body: goal,
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: TEXT, startLocation: WHERE });
  await automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects }).update(project.id, taskId, (current) => ({
    ...current, flowId: flow.flowId, startLocation: WHERE, attempts: [{ attemptId: "attempt.1", flowId: flow.flowId, ordinal: 1, route: "build", steps: [] }]
  }));
  /** What reached the generation path, and the press it ran under. */
  const asked: Array<{ input: Record<string, unknown>; pressed: unknown }> = [];
  service.getFlowBootstrapGenerationRuntimeReadiness = (() => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true, llmEvidenceRuntime: { bound: true, toolCount: 1, readRowsBound: true } })) as unknown as typeof service.getFlowBootstrapGenerationRuntimeReadiness;
  service.generateFlowBootstrapAdaptation = (async (input: Record<string, unknown>) => {
    asked.push({ input, pressed: structuredClone(automationStudioAnswerFirstRunAgainScope.getStore()) });
    return { projectId: input.projectId, flowId: input.flowId, status: "answered", sourceInstructionIds: [], baseDependencyDigest: "digest", baseSettingsRevision: 1, accounting: {} };
  }) as unknown as typeof service.generateFlowBootstrapAdaptation;
  const call = (payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runTaskAgain, scope: {}, actor: ACTOR, payload }) as Promise<{ ok: boolean; payload?: { attemptId?: string }; error?: string; errorCode?: string }>;
  return { service, project, flow, taskId, asked, call };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("run-task-again", () => {
  it("answers at once with the new attempt, and that attempt runs under the press, from where the task was asked", async () => {
    const lane = await world();
    const answer = await lane.call({ projectId: lane.project.id, taskId: lane.taskId });
    expect(answer.ok).toBe(true);
    const attemptId = answer.payload?.attemptId;
    expect(attemptId).toMatch(/^attempt\./u);
    await settled();
    expect(lane.asked).toHaveLength(1);
    expect(lane.asked[0]!.input).toMatchObject({ projectId: lane.project.id, flowId: lane.flow.flowId, authoringMode: "answer-first", evidenceGuided: true, startLocation: WHERE });
    expect(lane.asked[0]!.pressed).toEqual({ projectId: lane.project.id, flowId: lane.flow.flowId, taskId: lane.taskId, attemptId, opened: false });
  });

  it("carries nothing a model could set: no request field says it was pressed, and one beside the task is refused", async () => {
    const lane = await world();
    for (const extra of [{ flowId: "flow.other" }, { askedAgain: true }, { authoringMode: "candidate" }, { startLocation: "https://elsewhere.example/" }]) {
      const answer = await lane.call({ projectId: lane.project.id, taskId: lane.taskId, ...extra });
      expect(answer).toMatchObject({ ok: false, error: "Running a task again does not accept those request fields." });
    }
    await settled();
    expect(lane.asked).toEqual([]);
  });

  it("refuses, in a person's words, a task it does not have and a Flow given another task since, and starts nothing", async () => {
    const lane = await world();
    expect(await lane.call({ projectId: lane.project.id, taskId: "task.none" })).toMatchObject({ ok: false, error: AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS.unknown_task });
    const moved = await world("List my holds");
    expect(await moved.call({ projectId: moved.project.id, taskId: moved.taskId })).toMatchObject({ ok: false, error: AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS.other_task_on_flow });
    await settled();
    expect([...lane.asked, ...moved.asked]).toEqual([]);
  });
});
