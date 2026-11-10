// @fluxiq-test-group real-sql
// FluxNode runs through the FluxNode service, as the HTTP API calls it, on the real service with a
// scripted model and the lending library (`./library-lane.ts`): a first run explores and returns typed
// outputs with their lineage; a second with other inputs replays the saved Flow with no model call; a
// check's "no" goes back into the attempt; judge off with no check is achieved and unverified; the
// program's Stop ends a run stopped; and every event and result is the contracts' own.
import { fluxNodeRunStateSchema, parseFluxNodeRunEvent, parseFluxNodeRunResult, type FluxNodeEventAnswer, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, LOOK_TOOL, toolCall } from "../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const passing = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => (event.type === "check_needed" ? { type: "check_answer", eventId: event.eventId, pass: true } : undefined);

/** Every event is the contracts' and numbered from 1 with `ended` last; the result and the state are the contracts' too. */
function expectContractShapes(run: { events: FluxNodeRunEvent[]; result: unknown; state: unknown }): void {
  for (const event of run.events) expect(parseFluxNodeRunEvent(event), JSON.stringify(event)).toMatchObject({ ok: true });
  expect(run.events.map((event) => event.seq)).toEqual(run.events.map((_event, index) => index + 1));
  expect(run.events.at(-1)?.type).toBe("ended");
  expect(run.events.filter((event) => event.type === "ended")).toHaveLength(1);
  const parsed = parseFluxNodeRunResult(run.result);
  expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  expect(fluxNodeRunStateSchema.safeParse(run.state).success).toBe(true);
}

describe("a FluxNode run is an Answer First attempt", () => {
  it("explores once to typed outputs with lineage, then replays the saved Flow on new inputs with no model call", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")], answers: passing });
    expectContractShapes(first);
    expect(first.result).toMatchObject({ status: "achieved", path: "explored", flowPath: "nodes/library/find-loans", verdict: { label: "confirmed", by: "check" } });
    expect(first.result.outputs).toEqual({ loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] });
    expect(first.result.outputsType).toBeUndefined();
    expect(first.result.lineage).toEqual([expect.objectContaining({ pointer: "/loans/0", runId: first.result.runId, stepId: expect.stringMatching(/^read\./u), source: { kind: "read", readId: expect.any(String) } })]);
    expect(first.result.cost.calls).toBeGreaterThan(0);
    expect(first.judgeCalls).toHaveLength(0);
    const asked = first.events.filter((event) => event.type === "check_needed");
    expect(asked).toEqual([expect.objectContaining({ outputs: first.result.outputs, inputs: { title: "Atlas" } })]);

    const second = await lane.run({ name: "library.find-loans", inputs: { title: "Clock" } }, { answers: passing });
    expectContractShapes(second);
    expect(second.asked).toHaveLength(0);
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, specHash: first.result.specHash, verdict: { label: "confirmed", by: "check" }, cost: { calls: 0, tokens: 0, usd: 0 } });
    expect(second.result.outputs).toEqual({ loans: [{ title: "Clockmaking", due: "2030-01-03" }] });
    expect(lane.engineFinds).toEqual(["Clock"]);
  });

  it("a declared type the outputs do not fit is a no before the program is asked, and the attempt goes on", async () => {
    const lane = await fluxNodeLane(cleanups);
    const said: string[] = [];
    // At most one loan: a read of every loan with an "o" finds three, which the type refuses.
    const spec = findLoansSpec({ outputs: { type: "object", properties: { loans: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", properties: { title: { type: "string" }, due: { type: "string" } }, required: ["title", "due"] } } }, required: ["loans"] } });
    const run = await lane.run({ spec, inputs: { title: "Birds" } }, {
      script: [findLoans("o"), complete("Found the loans."), (request) => {
        said.push(JSON.stringify(request.context.evidenceLoop?.evidence ?? null));
        return findLoans("Birds", "find.birds");
      }, complete("Found the loan.")],
      answers: passing
    });
    expectContractShapes(run);
    expect(said[0]).toContain("do not fit the type the program declared");
    expect(run.events.filter((event) => event.type === "check_needed")).toHaveLength(1);
    expect(run.result).toMatchObject({ status: "achieved", verdict: { label: "confirmed", by: "check" } });
    expect(run.result.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
  });

  it("a check that fails is a no whose reason goes back into the attempt, and a later pass ends it achieved by the check", async () => {
    const lane = await fluxNodeLane(cleanups);
    const said: string[] = [];
    let checks = 0;
    const run = await lane.run({ spec: findLoansSpec(), inputs: { title: "Clock" } }, {
      script: [findLoans("Atlas"), complete("Found the loans."), (request) => {
        said.push(JSON.stringify(request.context.evidenceLoop?.evidence ?? null));
        return findLoans("Clock", "find.clock");
      }, complete("Found the loans with Clock.")],
      answers: (event) => {
        if (event.type !== "check_needed") return undefined;
        checks += 1;
        return checks === 1 ? { type: "check_answer", eventId: event.eventId, pass: false, reason: "those are not the loans whose title has Clock" } : { type: "check_answer", eventId: event.eventId, pass: true };
      }
    });
    expectContractShapes(run);
    expect(said[0]).toContain("those are not the loans whose title has Clock");
    expect(checks).toBe(2);
    expect(run.result).toMatchObject({ status: "achieved", verdict: { label: "confirmed", by: "check" } });
    expect(run.judgeCalls).toHaveLength(0);
  });

  it("judge off with no check and no type is achieved and unverified, with Core's records and their inferred type", async () => {
    const lane = await fluxNodeLane(cleanups);
    const run = await lane.run({ spec: findLoansSpec({ hasCheck: false, outputs: undefined, options: { judge: "off" } }), inputs: { title: "Birds" } }, { script: [findLoans("Birds"), complete("Found the loans.")] });
    expectContractShapes(run);
    expect(run.judgeCalls).toHaveLength(0);
    expect(run.events.some((event) => event.type === "check_needed")).toBe(false);
    expect(run.result).toMatchObject({ status: "achieved", verdict: { label: "unverified" } });
    expect(run.result.verdict.by).toBeUndefined();
    expect(run.result.outputs).toEqual({ records: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
    expect(run.result.outputsType).toEqual({ type: "object", properties: { records: { type: "array", items: { type: "object", properties: { title: { type: "string" }, due: { type: "string" } }, required: ["title", "due"] } } }, required: ["records"] });
    expect(run.result.resumeHandle).toBeUndefined();
  });

  it("the program's Stop ends the run stopped, with what it had, and nothing after", async () => {
    const lane = await fluxNodeLane(cleanups);
    let stopping: Promise<unknown> | undefined;
    let runId = "";
    const run = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, {
      onStarted: (state) => { runId = state.runId; },
      script: [findLoans("Atlas"), () => {
        stopping = lane.fluxNodes.stop(OWNER, runId, { reason: "The program is shutting down." });
        return toolCall("look", LOOK_TOOL, {});
      }],
      answers: passing
    });
    expectContractShapes(run);
    expect(run.result.status).toBe("stopped");
    expect(run.result.resumeHandle).toBeUndefined();
    const stopped = await stopping;
    expect(stopped).toMatchObject({ ok: true, value: { state: "stopped" } });
    expect(await lane.fluxNodes.stop(OWNER, runId, {})).toMatchObject({ ok: false, refusal: { code: "run_ended" } });
    expect(await lane.fluxNodes.answer(OWNER, runId, { type: "check_answer", eventId: "nothing", pass: true })).toMatchObject({ ok: false, refusal: { code: "run_ended" } });
  });
});
