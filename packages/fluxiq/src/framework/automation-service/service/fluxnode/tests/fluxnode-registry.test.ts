// @fluxiq-test-group real-sql
// The FluxNode service's bookkeeping around runs (`./library-lane.ts`): registering is idempotent by
// name and spec hash, an idempotency key answers the run it started, a budget-out run continues from
// its resume handle with the same inputs, runs list newest first a page at a time, an export carries
// the Flow and records a pin, and a register body with neither a spec nor a pipeline is refused (a pipeline run
// is `../pipeline/tests/pipeline-runs.test.ts`).
import { fluxNodeFlowExportSchema, fluxNodeSpecSchema, type FluxNodeRegisterSpecRequest, type FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const unchecked = (over = {}) => findLoansSpec({ hasCheck: false, outputs: undefined, options: { judge: "off" }, ...over });

describe("the FluxNode service's bookkeeping", () => {
  it("registers a spec once per name and hash, files its Flow under nodes/, and says when a new spec replaces the latest", async () => {
    const lane = await fluxNodeLane(cleanups);
    const spec = fluxNodeSpecSchema.parse(findLoansSpec());
    const first = await lane.fluxNodes.register(OWNER, { spec });
    expect(first).toMatchObject({ ok: true, value: { name: "library.find-loans", flowPath: "nodes/library/find-loans", created: true } });
    expect(first.ok && first.value.previousSpecHash).toBeUndefined();
    const again = await lane.fluxNodes.register(OWNER, { spec });
    expect(again).toMatchObject({ ok: true, value: { created: false } });
    expect(again.ok && first.ok && again.value.specHash === first.value.specHash).toBe(true);
    const changed = await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec({ goal: "List every loan whose title has {title}." })) });
    expect(changed).toMatchObject({ ok: true, value: { created: true, previousSpecHash: first.ok ? first.value.specHash : "" } });
    expect(await lane.fluxNodes.start(OWNER, { name: "library.nothing", inputs: {} } as FluxNodeRunRequest)).toMatchObject({ ok: false, refusal: { code: "unknown_fluxnode" } });
    expect(await lane.fluxNodes.start(OWNER, { name: "library.find-loans", specHash: "0".repeat(64), inputs: { title: "x" } } as FluxNodeRunRequest)).toMatchObject({ ok: false, refusal: { code: "unknown_spec_hash" } });
    expect(await lane.fluxNodes.start(OWNER, { name: "library.find-loans", inputs: { title: 3 } } as FluxNodeRunRequest)).toMatchObject({ ok: false, refusal: { code: "invalid_inputs", issues: [expect.objectContaining({ path: "/inputs/title" })] } });
    expect(await lane.fluxNodes.register(OWNER, {} as FluxNodeRegisterSpecRequest)).toMatchObject({ ok: false, refusal: { code: "invalid_request" } });
  });

  it("an idempotency key answers the run it started, and refuses another request", async () => {
    const lane = await fluxNodeLane(cleanups);
    const request = { spec: unchecked(), inputs: { title: "Atlas" }, idempotencyKey: "order-17" };
    const run = await lane.run(request, { script: [findLoans("Atlas"), complete("Found the loans.")] });
    const repeated = await lane.fluxNodes.start(OWNER, { ...request, spec: fluxNodeSpecSchema.parse(request.spec) });
    expect(repeated).toMatchObject({ ok: true, value: { runId: run.result.runId, state: "achieved" } });
    expect(await lane.fluxNodes.start(OWNER, { ...request, spec: fluxNodeSpecSchema.parse(request.spec), inputs: { title: "Birds" } })).toMatchObject({ ok: false, refusal: { code: "idempotency_conflict" } });
  });

  it("a budget of 0 ends budget_out with a resume handle that continues with the same inputs, and runs list newest first by pages", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: unchecked(), inputs: { title: "Clock" }, options: { budgetUsd: 0 }, correlationId: "batch-1" });
    expect(first.result).toMatchObject({ status: "budget_out", resumeHandle: expect.any(String), cost: { calls: 0 } });
    expect(first.events.find((event) => event.type === "cost")).toMatchObject({ budgetUsd: 0 });
    const resumed = await lane.run({ resumeHandle: first.result.resumeHandle });
    expect(resumed.result).toMatchObject({ status: "budget_out", name: "library.find-loans", specHash: first.result.specHash, correlationId: "batch-1" });
    expect(resumed.result.runId).not.toBe(first.result.runId);
    expect(await lane.fluxNodes.start(OWNER, { resumeHandle: "resume.fnr-nothing-at-all" } as FluxNodeRunRequest)).toMatchObject({ ok: false, refusal: { code: "unknown_run" } });

    const page = await lane.fluxNodes.list(OWNER, { limit: 1 });
    expect(page).toMatchObject({ ok: true, value: { runs: [{ runId: resumed.result.runId, state: "budget_out" }], nextCursor: resumed.result.runId } });
    const next = await lane.fluxNodes.list(OWNER, { limit: 1, cursor: page.ok ? page.value.nextCursor! : "" });
    expect(next).toMatchObject({ ok: true, value: { runs: [{ runId: first.result.runId }] } });
    expect(next.ok && next.value.nextCursor).toBeUndefined();
    expect(await lane.fluxNodes.list(OWNER, { limit: 50, correlationId: "batch-2" })).toMatchObject({ ok: true, value: { runs: [] } });
  });

  it("an export carries the Flow in the contract's format, and a pin is recorded", async () => {
    const lane = await fluxNodeLane(cleanups);
    const run = await lane.run({ spec: unchecked(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")] });
    const exported = await lane.fluxNodes.exportFlow(OWNER, "library.find-loans", { pin: true });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(fluxNodeFlowExportSchema.safeParse(exported.value).success).toBe(true);
    expect(exported.value).toMatchObject({ name: "library.find-loans", specHash: run.result.specHash, flowId: run.result.flowId, flowPath: "nodes/library/find-loans", flowVersion: 1, pinned: true });
    expect(exported.value.flow).toMatchObject({ artifact: { flowId: run.result.flowId, metadata: { fluxNode: { name: "library.find-loans", specHash: run.result.specHash, flowPath: "nodes/library/find-loans" } } } });
    expect(await lane.fluxNodes.exportFlow(OWNER, "library.other", { pin: false })).toMatchObject({ ok: false, refusal: { code: "unknown_fluxnode" } });
  });

  it("explore starts fresh with the model, and the learned Flow it did not use is still the one auto replays", async () => {
    const lane = await fluxNodeLane(cleanups);
    const learn = await lane.run({ spec: unchecked(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")] });
    expect(learn.result).toMatchObject({ status: "achieved", path: "explored" });
    const fresh = await lane.run({ name: "library.find-loans", inputs: { title: "Birds" }, options: { mode: "explore" } }, { script: [findLoans("Birds"), complete("Found the loans.")] });
    expect(fresh.result).toMatchObject({ status: "achieved", path: "explored", flowId: learn.result.flowId });
    expect(fresh.decisions.length).toBeGreaterThan(0);
    const replayed = await lane.run({ name: "library.find-loans", inputs: { title: "Clock" } });
    expect(replayed.asked).toHaveLength(0);
    expect(replayed.result).toMatchObject({ status: "achieved", path: "replayed", outputs: { records: [{ title: "Clockmaking", due: "2030-01-03" }] } });
  });
});
