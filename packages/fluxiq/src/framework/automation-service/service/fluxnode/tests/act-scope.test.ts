// @fluxiq-test-group real-sql
// Each FluxNode run is its own execution, with an act record of its own (t909): its lasting act lands
// whatever an earlier run landed, while the saved Flow is still the task's, found by name and spec hash
// and replayed at no model call. A run carrying an earlier run's idempotency key continues that run's
// record, so a retried request never presses again what may have landed. A lending library's card,
// renewed with a note the run is given, stands in for any save; it is none of the Lab's scenarios.
import { fluxNodeSpecSchema, parseFluxNodeRunRequest, type FluxNodeEventAnswer, type FluxNodeRunEvent, type FluxNodeSpecInput } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, RENEW_CARD, runNode } from "../../answer-first/tests/fake-library.ts";
import { automationStudioAnswerFirstTaskKey } from "../../answer-first/task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../answer-first/task-memory/index.ts";
import { fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NAME = "library.renew-card";
const pressCard = (callId = "card") => runNode(callId, RENEW_CARD, {}, ["modify_existing"], { add: true });
const explore = { script: [pressCard(), complete("Renewed the card.")] };
const nothingAsked = (_event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => undefined;

/** A FluxNode whose one act lasts: it renews the card, and takes the note its goal names. No check and no judge, so a run is its own act. */
function renewCardSpec(over: Partial<FluxNodeSpecInput> = {}): FluxNodeSpecInput {
  return {
    name: NAME, runtime: "library", goal: "Renew my library card, noting {note}.", start: "library://account",
    inputs: { type: "object", properties: { note: { type: "string" } }, required: ["note"] },
    scope: { acts: ["change"] }, hasCheck: false, options: { judge: "off" },
    ...over
  };
}

describe("a FluxNode run's lasting act", () => {
  it("lands on four runs with other inputs, each replay using the predecessor's saved Flow at no model call", async () => {
    const lane = await fluxNodeLane(cleanups);
    let before: { projects: number; tasks: number; scopes: number; state: string | undefined; done: true | undefined } | undefined;
    const first = await lane.run({ spec: renewCardSpec(), inputs: { note: "moving house" } }, { script: [pressCard(), async () => {
      const { projects } = await lane.service.listProjects("library");
      const memory = automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects });
      const tasks = await memory.list(projects[0]!.id);
      const [task] = tasks;
      const [scoped] = Object.values(task?.actsByScope ?? {});
      before = { projects: projects.length, tasks: tasks.length, scopes: Object.keys(task?.actsByScope ?? {}).length, state: scoped?.data.acts[0]?.state, done: scoped?.data.acts[0]?.doneInAchieved };
      return complete("Renewed the card.");
    }], answers: nothingAsked });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(before).toMatchObject({ state: "landed", done: undefined });
    expect(lane.library.renewals.card).toBe(1);

    const { projects } = await lane.service.listProjects("library");
    const memory = automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects });
    const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: `fluxnode:${NAME}:${first.result.specHash}` });
    let previous = await memory.get(projects[0]!.id, taskId);
    for (const note of ["new address", "delivery moved", "contact updated"]) {
      const beganAt = Date.now();
      const again = await lane.run({ name: NAME, inputs: { note } }, { answers: nothingAsked });
      expect(again.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, cost: { calls: 0 } });
      expect(again.asked).toHaveLength(0);
      const now = await memory.get(projects[0]!.id, taskId);
      expect(now?.attempts.at(-1)?.startedFrom).toMatchObject({ attemptId: previous?.best?.attemptId, stepsDigest: previous?.best?.stepsDigest });
      console.info("t909 continuation", JSON.stringify({ path: again.result.path, flow: again.result.flowId, calls: again.result.cost.calls, ms: Date.now() - beganAt }));
      previous = now;
    }
    expect(lane.engineCards).toEqual([RENEW_CARD, RENEW_CARD, RENEW_CARD]);
    expect(lane.library.renewals.card).toBe(4);
    expect(Object.keys(previous?.actsByScope ?? {})).toHaveLength(4);
    await lane.restartCore();
    const reopened = automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects });
    const durable = await reopened.get(projects[0]!.id, taskId);
    for (const record of Object.values(durable?.actsByScope ?? {})) expect(record.data.acts[0]?.doneInAchieved).toBe(true);
    const lastScope = durable?.attempts.at(-1)?.caller?.actScope;
    expect(lastScope).toBeDefined();
    expect(durable?.acts).toEqual(durable?.actsByScope?.[lastScope!]);
  });

  it("lands on each run with the same inputs and no idempotency key: each is a deliberate run", async () => {
    const lane = await fluxNodeLane(cleanups);
    await lane.run({ spec: renewCardSpec(), inputs: { note: "moving house" } }, { ...explore, answers: nothingAsked });
    for (let attempt = 2; attempt <= 4; attempt += 1) {
      const again = await lane.run({ name: NAME, inputs: { note: "moving house" } }, { answers: nothingAsked });
      expect(again.result).toMatchObject({ status: "achieved", path: "replayed", cost: { calls: 0 } });
      expect(again.asked).toHaveLength(0);
      expect(lane.library.renewals.card).toBe(attempt);
    }
    expect(lane.engineCards).toEqual([RENEW_CARD, RENEW_CARD, RENEW_CARD]);
  });

  it("is not pressed again by a retry with the same idempotency key, which ends with its result", async () => {
    const lane = await fluxNodeLane(cleanups);
    const request = { spec: renewCardSpec(), inputs: { note: "moving house" }, idempotencyKey: "renew-2030-01" };
    const first = await lane.run(request, { ...explore, answers: nothingAsked });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(lane.library.renewals.card).toBe(1);
    // While this Core holds the run, the key answers it: nothing runs.
    const parsed = parseFluxNodeRunRequest(request);
    if (!parsed.ok) throw new Error("a bad request in the test");
    const again = await lane.fluxNodes.start(OWNER, parsed.value);
    expect(again.ok && again.value.runId).toBe(first.result.runId);
    expect(lane.library.renewals.card).toBe(1);

    // A restart forgets the run, so the retry is a new run; its key and request are the first run's execution.
    lane.restart();
    const retried = await lane.run(request, { answers: nothingAsked });
    expect(retried.result.runId).not.toBe(first.result.runId);
    expect(retried.result.status).toBe("achieved");
    expect(retried.decisions).toHaveLength(0);
    expect(lane.engineCards).toEqual([]);
    expect(lane.library.renewals.card).toBe(1);

    // Another key, or none, is another execution, and lands.
    const other = await lane.run({ ...request, idempotencyKey: "renew-2030-02" }, { answers: nothingAsked });
    expect(other.result).toMatchObject({ status: "achieved", path: "replayed" });
    expect(lane.library.renewals.card).toBe(2);
  });

  it("keeps a keyed execution after another execution and a full Core restart", async () => {
    const lane = await fluxNodeLane(cleanups);
    const request = { spec: renewCardSpec(), inputs: { note: "moving house" }, idempotencyKey: "renew-before-restart" };
    const first = await lane.run(request, { ...explore, answers: nothingAsked });
    expect(first.result.status).toBe("achieved");
    const other = await lane.run({ name: NAME, inputs: { note: "new address" } }, { answers: nothingAsked });
    expect(other.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(2);

    await lane.restartCore();
    const retried = await lane.run(request, { answers: nothingAsked });
    expect(retried.result.status).toBe("achieved");
    expect(retried.asked).toHaveLength(0);
    expect(lane.library.renewals.card).toBe(2);
    expect(lane.engineCards).toEqual([RENEW_CARD]);
  });

  it("resumes an explore execution under its original task after an intervening run", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: renewCardSpec(), inputs: { note: "moving house" }, options: { mode: "explore", budgetUsd: 0.001 } }, { script: [pressCard()] });
    expect(first.result).toMatchObject({ status: "budget_out", resumeHandle: expect.any(String), cost: { calls: 1 } });
    expect(lane.library.renewals.card).toBe(1);
    const other = await lane.run({ name: NAME, inputs: { note: "new address" } }, { ...explore, answers: nothingAsked });
    expect(other.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(2);

    const resumed = await lane.run({ resumeHandle: first.result.resumeHandle }, { ...explore, answers: nothingAsked });
    expect(["achieved", "budget_out"]).toContain(resumed.result.status);
    expect(lane.library.renewals.card).toBe(2);
  });

  it("a pipeline resumes each intentional equal-input invocation after a child has completed and another ran out of budget", async () => {
    const lane = await fluxNodeLane(cleanups);
    await lane.run({ spec: renewCardSpec(), inputs: { note: "same note" } }, explore);
    const later = `${NAME}-later`;
    expect(await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(renewCardSpec({ name: later })) })).toMatchObject({ ok: true });
    const request = {
      pipeline: { name: "library.two-rounds", source: { kind: "input", field: "jobs" }, steps: [
        { id: "first", kind: "map", target: { fluxNode: NAME }, inputs: { note: { field: "note" } }, as: "first", concurrency: 1 },
        { id: "later", kind: "map", target: { fluxNode: later }, inputs: { note: { field: "note" } }, as: "later", concurrency: 1 }
      ] },
      inputs: { jobs: [{ note: "same note" }, { note: "same note" }] },
      options: { budgetUsd: 0.001 }, idempotencyKey: "two-rounds"
    };
    const first = await lane.run(request, { script: [pressCard()] });
    expect(first.result.status).toBe("budget_out");
    expect(lane.library.renewals.card).toBe(4); // One learned separately, two complete children, one partial child.
    const resumed = await lane.run({ resumeHandle: first.result.resumeHandle });
    expect(resumed.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(5); // Only the fourth intended child act is new.
    expect(resumed.asked).toHaveLength(0);
    await lane.restartCore();
    const retry = await lane.run(request);
    expect(retry.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(5);
    expect(retry.asked).toHaveLength(0);
  });
});
