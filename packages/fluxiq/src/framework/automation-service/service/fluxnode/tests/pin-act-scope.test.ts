// @fluxiq-test-group real-sql
import { afterEach, expect, it, vi } from "vitest";
import { fluxNodeSpecSchema, parseFluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { complete, RENEW_CARD, runNode } from "../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it("retains a keyed execution's act ownership when pin state changes before full restart", async () => {
  const lane = await fluxNodeLane(cleanups);
  const spec = { name: "library.pin-scope", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const request = { spec, inputs: {}, idempotencyKey: "before-pin" };
  await lane.run(request, { script: [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")] });
  await lane.run({ name: spec.name, inputs: {} });
  expect(lane.library.renewals.card).toBe(2);
  expect(await lane.fluxNodes.exportFlow(OWNER, spec.name, { pin: true })).toMatchObject({ ok: true });
  await lane.restartCore();
  const retry = await lane.run(request);
  expect(retry.result.status).toBe("achieved");
  expect(retry.asked).toHaveLength(0);
  expect(lane.library.renewals.card).toBe(2);
});

it("refuses to bind an old key to a newly registered resolved spec after restart", async () => {
  const lane = await fluxNodeLane(cleanups);
  const spec = { name: "library.changed-target", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const script = [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")];
  await lane.run({ spec, inputs: {} }, { script });
  const request = { name: spec.name, inputs: {}, idempotencyKey: "before-target-change" };
  await lane.run(request);
  expect(lane.library.renewals.card).toBe(2);
  expect(await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse({ ...spec, goal: "Renew the card and record it." }) })).toMatchObject({ ok: true });
  await lane.restartCore();
  lane.arm({ script });
  const parsed = parseFluxNodeRunRequest(request);
  if (!parsed.ok) throw new Error("Invalid fixture request.");
  const started = await lane.fluxNodes.start(OWNER, parsed.value);
  if (started.ok) {
    const stream = await lane.fluxNodes.events(OWNER, started.value.runId, 0, new AbortController().signal);
    if (!stream.ok) throw new Error(stream.refusal.code);
    for await (const _event of stream.value) { /* Observe an incorrectly admitted target through its natural ending. */ }
  }
  expect(lane.library.renewals.card).toBe(2);
  expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("resolved target") } });
});

it("refuses a changed named child target when the same parent execution restarts", async () => {
  const lane = await fluxNodeLane(cleanups);
  const spec = { name: "library.changed-child", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const script = [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")];
  await lane.run({ spec, inputs: {} }, { script });
  const request = {
    pipeline: { name: "library.fixed-child-invocation", source: { kind: "input", field: "rows" }, steps: [{ id: "save", kind: "map", target: { fluxNode: spec.name }, inputs: {}, concurrency: 1 }] },
    inputs: { rows: [{ job: "first" }] }, idempotencyKey: "parent-before-child-change"
  };
  expect((await lane.run(request)).result.status).toBe("achieved");
  expect(lane.library.renewals.card).toBe(2);
  expect(await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse({ ...spec, goal: "Renew the card and record it." }) })).toMatchObject({ ok: true });
  await lane.restartCore();
  lane.arm({ script });
  const parsed = parseFluxNodeRunRequest(request);
  if (!parsed.ok) throw new Error("Invalid fixture request.");
  const started = await lane.fluxNodes.start(OWNER, parsed.value);
  if (started.ok) {
    const stream = await lane.fluxNodes.events(OWNER, started.value.runId, 0, new AbortController().signal);
    if (!stream.ok) throw new Error(stream.refusal.code);
    for await (const _event of stream.value) { /* Observe an incorrectly admitted changed child. */ }
  }
  expect(lane.library.renewals.card).toBe(2);
  expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("resolved target") } });
});

it("retains an admitted child version during a run and resolves a fresh version for a new parent", async () => {
  const lane = await fluxNodeLane(cleanups);
  const source = "library.paused-source";
  const spec = { name: "library.admitted-child", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const script = [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")];
  const learned = await lane.run({ spec, inputs: {} }, { script });
  await lane.run({ spec: findLoansSpec({ name: source, hasCheck: false, options: { judge: "off" }, outputs: { type: "array", items: { type: "object", properties: { title: { type: "string" }, due: { type: "string" } }, required: ["title", "due"] } } }), inputs: { title: "" } }, { script: [findLoans(""), complete("Read the source.")] });
  let reached = (): void => undefined;
  let release = (): void => undefined;
  const reading = new Promise<void>((resolve) => { reached = resolve; });
  const allowed = new Promise<void>((resolve) => { release = resolve; });
  lane.engine.over = async () => {
    reached();
    await allowed;
    return undefined;
  };
  const request = { pipeline: { name: "library.admitted-versions", source: { kind: "flow", target: { fluxNode: source }, inputs: { title: { value: "" } } }, steps: [{ id: "save", kind: "map", target: { fluxNode: spec.name }, inputs: {}, concurrency: 1 }] }, inputs: {} };
  const running = lane.run(request);
  await reading;
  const changed = await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse({ ...spec, goal: "Renew my card." }) });
  release();
  expect(changed).toMatchObject({ ok: true });
  const first = await running;
  lane.engine.over = undefined;
  expect(first.result).toMatchObject({ status: "achieved", cost: { calls: 0 } });
  expect(lane.library.renewals.card).toBe(4);
  const children = await lane.fluxNodes.list(OWNER, { limit: 20, correlationId: first.result.runId });
  if (!children.ok) throw new Error(children.refusal.code);
  expect(children.value.runs.filter((run) => run.name === spec.name).map((run) => run.specHash)).toEqual([learned.result.specHash, learned.result.specHash, learned.result.specHash]);
  const fresh = await lane.run({ name: "library.admitted-versions", inputs: {} }, { script });
  expect(fresh.result.status).toBe("achieved");
  expect(lane.library.renewals.card).toBe(7);
  const newer = await lane.fluxNodes.list(OWNER, { limit: 20, correlationId: fresh.result.runId });
  if (!newer.ok || !changed.ok) throw new Error("Missing fixture registration.");
  expect(newer.value.runs.filter((run) => run.name === spec.name).map((run) => run.specHash)).toEqual([changed.value.specHash, changed.value.specHash, changed.value.specHash]);
});
