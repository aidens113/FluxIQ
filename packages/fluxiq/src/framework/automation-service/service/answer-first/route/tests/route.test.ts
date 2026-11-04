// Where an attempt starts: nothing saved builds, a saved Flow that assembles runs, one that does
// not is repaired; and the chat can find the Flow an exact task lives under.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../task-key/index.ts";
import { automationStudioAnswerFirstStepsDigest, automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstSavedFlow, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../../task-memory/index.ts";
import { automationStudioAnswerFirstKnownFlow, automationStudioAnswerFirstRoute } from "../index.ts";

const steps = [{ position: 1, actionId: "open", input: { page: "desk" }, iteration: 1, effect: "observe" }] as unknown as AutomationStudioFlowDraftStep[];
const saved: AutomationStudioAnswerFirstSavedFlow = { attemptId: "attempt.1", flowId: "flow.1", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "confirmed", provenWhole: true, savedAtMs: 1, spend: { calls: 2, usd: 0.02 } };
const note = { attemptId: "attempt.1", atMs: 1, from: "model" as const, quirks: "the desk closes early" };
const memory = (over: Partial<AutomationStudioAnswerFirstTaskMemory> = {}): AutomationStudioAnswerFirstTaskMemory => ({ taskId: "task.a", flowId: "flow.1", notes: [], attempts: [], ...over });
const base = { projectId: "project.1", flowId: "flow.1", taskId: "task.a" };
const fits = () => ({ ok: true as const });

describe("the route", () => {
  it("builds where nothing is saved, carrying notes where there are any", () => {
    expect(automationStudioAnswerFirstRoute({ ...base, memory: undefined, assemble: fits })).toEqual({ kind: "build", notes: [] });
    expect(automationStudioAnswerFirstRoute({ ...base, memory: memory({ notes: [note] }), assemble: fits })).toEqual({ kind: "build", notes: [note] });
  });
  it("builds where the best has no steps, and passes `related` through", () => {
    const related = { steps, flowId: "flow.0" };
    expect(automationStudioAnswerFirstRoute({ ...base, memory: memory({ best: { ...saved, steps: [] } }), assemble: fits, related })).toEqual({ kind: "build", notes: [], related });
  });
  it("uses a best Flow whose steps assemble, handing assemble the saved steps", () => {
    let given: unknown;
    const assemble = (each: AutomationStudioFlowDraftStep[]) => {
      given = each;
      return { ok: true as const };
    };
    const route = automationStudioAnswerFirstRoute({ ...base, memory: memory({ best: saved, latest: { ...saved, label: "unverified" }, notes: [note] }), assemble });
    expect(route).toEqual({ kind: "use", saved, notes: [note] });
    expect(given).toBe(saved.steps);
  });
  it("repairs a best Flow whose steps do not assemble, with a plain reason", () => {
    const route = automationStudioAnswerFirstRoute({ ...base, memory: memory({ best: saved, notes: [note] }), assemble: () => ({ ok: false, codes: ["flow.missing_binding"] }) });
    expect(route).toMatchObject({ kind: "repair", saved, notes: [note] });
    expect((route as { why: string }).why).not.toMatch(/flow\.missing|_/);
  });
  it("reads an assemble that throws as not assembled", () => {
    const assemble = (): { ok: true } => {
      throw new Error("boom");
    };
    const route = automationStudioAnswerFirstRoute({ ...base, memory: memory({ best: saved }), assemble });
    expect(route.kind).toBe("repair");
  });
  it("never throws on a memory with a damaged shape", () => {
    const damaged = { taskId: "task.a", flowId: "flow.1", best: { steps: "none" } } as unknown as AutomationStudioAnswerFirstTaskMemory;
    expect(automationStudioAnswerFirstRoute({ ...base, memory: damaged, assemble: fits }).kind).toBe("build");
  });
});

describe("the known Flow", () => {
  const ports = (): AutomationStudioAnswerFirstTaskMemoryPorts => ({ paths: new AutomationStudioProjectPaths(undefined), projects: { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioAnswerFirstTaskMemoryPorts["projects"] });
  const ask = { projectId: "project.1", instructionText: "List the books on loan to member 12", startLocation: "https://lending.example.test/desk" };

  it("answers the Flow saved for that exact task, and none for another or for nothing saved", async () => {
    const owner = {};
    const p = ports();
    await expect(automationStudioAnswerFirstKnownFlow(owner, p, ask)).resolves.toBeUndefined();
    const taskId = automationStudioAnswerFirstTaskKey(ask);
    await automationStudioAnswerFirstTaskMemoryOf(owner, p).update("project.1", taskId, () => memory({ taskId, flowId: "flow.7", best: { ...saved, flowId: "flow.7" } }));
    await expect(automationStudioAnswerFirstKnownFlow(owner, p, { ...ask, instructionText: `  List the books  on loan to member 12 ` })).resolves.toBe("flow.7");
    await expect(automationStudioAnswerFirstKnownFlow(owner, p, { ...ask, instructionText: "list the books on loan to member 12" })).resolves.toBeUndefined();
    await expect(automationStudioAnswerFirstKnownFlow(owner, p, { ...ask, startLocation: "https://other.example.test/desk" })).resolves.toBeUndefined();
  });
  it("answers none where only notes were kept", async () => {
    const owner = {};
    const p = ports();
    const taskId = automationStudioAnswerFirstTaskKey(ask);
    await automationStudioAnswerFirstTaskMemoryOf(owner, p).update("project.1", taskId, () => memory({ taskId, notes: [note] }));
    await expect(automationStudioAnswerFirstKnownFlow(owner, p, ask)).resolves.toBeUndefined();
  });
});
