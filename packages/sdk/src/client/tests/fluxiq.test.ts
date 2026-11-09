import type { FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { FluxNodeApiError, SdkError } from "../../errors/index.ts";
import { checkedListingsScenario } from "../../tests/fake-engine/checked-listings-scenario.ts";
import { listingsNode } from "../../tests/fake-engine/listings-node.ts";
import { startKeyedEngine, type KeyedEngine } from "../../tests/fake-engine/start-keyed-engine.ts";
import type { Scenario } from "../../tests/fake-engine/start-fake-engine.ts";
import { FluxIQ } from "../fluxiq.ts";

let started: KeyedEngine | undefined;

async function connect(scenario: Scenario, extra: { dropFirstStreamAfter?: number } = {}): Promise<{ fluxiq: FluxIQ; keyed: KeyedEngine }> {
  const keyed = await startKeyedEngine({ scenario, ...extra });
  started = keyed;
  const fluxiq = await FluxIQ.connect({ url: keyed.engine.url, apiKey: keyed.privateKeyPem, env: {}, cwd: process.cwd() });
  return { fluxiq, keyed };
}

afterEach(async () => {
  await started?.engine.close();
  started = undefined;
});

const sample = { query: "lens hood", country: "UK", count: 3 };

describe("FluxIQ.run", () => {
  it("returns typed outputs after a check round trip run in this process", async () => {
    const { fluxiq, keyed } = await connect(checkedListingsScenario());
    const checked: string[] = [];
    const node = listingsNode();
    const run = await fluxiq.run(node, sample, { onEvent: (event) => void checked.push(event.type) });
    expect(run.status).toBe("achieved");
    if (run.status !== "achieved") throw new Error("not achieved");
    expectTypeOf(run.outputs.listings[0]?.title).toEqualTypeOf<string | undefined>();
    expect(run.outputs.listings.map((listing) => listing.title)).toEqual(["Lens hood 1", "Lens hood 2", "Lens hood 3"]);
    expect(run.verdict).toEqual({ label: "confirmed", by: "check" });
    expect(run.path).toBe("explored");
    expect(run.cost.usd).toBeGreaterThan(0);
    const answers = keyed.engine.requests.filter((request) => request.path.endsWith("/answers")).map((request) => request.body);
    expect(answers).toEqual([
      { type: "check_answer", eventId: "check_1", pass: false, reason: "wrong number of listings" },
      { type: "check_answer", eventId: "check_2", pass: true }
    ]);
    expect(checked.at(-1)).toBe("ended");
  });

  it("sends the spec and the inputs with the session the key earned, and never the key", async () => {
    const { fluxiq, keyed } = await connect(checkedListingsScenario());
    await fluxiq.run(listingsNode(), sample);
    const start = keyed.engine.requests.find((request) => request.method === "POST" && request.path === "/api/fluxnode/v1/runs");
    expect(start?.bearer).toBe(true);
    expect(start?.clientHeader).toBe("sdk");
    expect(start?.body).toMatchObject({ spec: { name: "market.cheapest-listings", hasCheck: true }, inputs: sample });
    expect(JSON.stringify(keyed.engine.requests)).not.toContain(keyed.privateKeyPem.slice(30, 60));
  });

  it("answers a person_needed event through onPersonNeeded and goes on", async () => {
    const { fluxiq } = await connect(checkedListingsScenario({ askPerson: true }));
    const seen: string[] = [];
    const run = await fluxiq.run(listingsNode(), sample, {
      onPersonNeeded: (event) => {
        seen.push(`${event.need}: ${event.reason}`);
        return { outcome: "done", note: "signed in" };
      }
    });
    expect(seen).toEqual(["sign_in: Sign in to market.example to see prices."]);
    expect(run.status).toBe("achieved");
  });

  it("ends waiting_for_person with a resume handle when nobody answers, and resumes", async () => {
    const { fluxiq } = await connect(checkedListingsScenario({ askPerson: true }));
    const waiting = await fluxiq.run(listingsNode(), sample);
    expect(waiting.status).toBe("waiting_for_person");
    expect(waiting.waitingFor).toMatch(/Sign in/u);
    expect(waiting.resumeHandle).toBeDefined();
    const finished = await fluxiq.resume(listingsNode(), waiting.resumeHandle as string);
    expect(finished.status).toBe("achieved");
  });

  it("refuses inputs that do not fit the declared type before any request is made", async () => {
    const { fluxiq, keyed } = await connect(checkedListingsScenario());
    const before = keyed.engine.requests.length;
    await expect(fluxiq.run(listingsNode(), { query: "x", country: "UK", count: 99 })).rejects.toThrow(/do not fit its declared type/u);
    expect(keyed.engine.requests.length).toBe(before);
  });

  it("throws the engine's refusal as a typed error", async () => {
    const { fluxiq } = await connect(checkedListingsScenario());
    const attempt = fluxiq.resume(listingsNode(), "not-a-known-handle-0001");
    await expect(attempt).rejects.toBeInstanceOf(FluxNodeApiError);
    await expect(attempt).rejects.toMatchObject({ status: 404, apiCode: "unknown_fluxnode" });
  });

  it("stops the run when the program's signal aborts, and returns stopped", async () => {
    const waitForStop: Scenario = async (run) => {
      while (!run.stopRequested) await new Promise((resolve) => setTimeout(resolve, 10));
      run.end({ status: "stopped" });
    };
    const { fluxiq, keyed } = await connect(waitForStop);
    const controller = new AbortController();
    const pending = fluxiq.run(listingsNode(), sample, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    expect((await pending).status).toBe("stopped");
    expect(keyed.engine.requests.some((request) => request.path.endsWith("/stop"))).toBe(true);
  });

  it("does not start a run on a signal that is already aborted", async () => {
    const { fluxiq } = await connect(checkedListingsScenario());
    const controller = new AbortController();
    controller.abort();
    await expect(fluxiq.run(listingsNode(), sample, { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("does not trust outputs that miss the declared type", async () => {
    const wrong: Scenario = async (run) => run.end({ status: "achieved", outputs: { listings: "none" } });
    const { fluxiq } = await connect(wrong);
    const attempt = fluxiq.run(listingsNode(), sample);
    await expect(attempt).rejects.toBeInstanceOf(SdkError);
    await expect(attempt).rejects.toMatchObject({ code: "invalid_outputs" });
  });

  it("reconnects from the last event it saw when the stream drops, and sees each event once", async () => {
    const { fluxiq, keyed } = await connect(checkedListingsScenario(), { dropFirstStreamAfter: 1 });
    const events: FluxNodeRunEvent[] = [];
    for await (const event of fluxiq.stream(listingsNode(), sample)) events.push(event);
    expect(events.map((event) => event.seq)).toEqual([...events.map((event) => event.seq)].sort((a, b) => a - b));
    expect(new Set(events.map((event) => event.seq)).size).toBe(events.length);
    expect(events.at(-1)?.type).toBe("ended");
    expect(keyed.engine.requests.filter((request) => request.path.includes("/events")).length).toBeGreaterThan(1);
  });

  it("answers the engine's transform_needed with a registered transform, and says so when none is registered", async () => {
    const asks: Scenario = async (run) => {
      run.emit({ type: "transform_needed", eventId: "t1", stepId: "enrich", callback: "double", records: [{ n: 2 }] });
      run.emit({ type: "transform_needed", eventId: "t2", stepId: "enrich", callback: "missing", records: [] });
      const first = await run.awaitAnswer("t1", 1000);
      const second = await run.awaitAnswer("t2", 1000);
      run.end({ status: "achieved", outputs: { first: JSON.stringify(first), second: JSON.stringify(second) } });
    };
    const { fluxiq } = await connect(asks);
    const node = listingsNode();
    const events: FluxNodeRunEvent[] = [];
    for await (const event of fluxiq.stream(node, sample, { transforms: { double: (records) => records.map((record) => ({ n: Number(record.n) * 2 })) } })) events.push(event);
    const ended = events.at(-1);
    if (ended?.type !== "ended") throw new Error("no ended event");
    const outputs = ended.result.outputs as { first: string; second: string };
    expect(JSON.parse(outputs.first)).toMatchObject({ type: "transform_answer", records: [{ n: 4 }] });
    expect(JSON.parse(outputs.second)).toMatchObject({ type: "transform_answer", error: expect.stringContaining('no transform named "missing"') });
  });
});

describe("FluxIQ calls beside run", () => {
  it("registers, lists, reads and stops runs through the contracts' endpoints", async () => {
    const { fluxiq } = await connect(checkedListingsScenario());
    const node = listingsNode();
    const registered = await fluxiq.register(node);
    expect(registered).toMatchObject({ name: "market.cheapest-listings", created: true, flowPath: "nodes/market/cheapest-listings" });
    const run = await fluxiq.run(node, sample);
    expect((await fluxiq.listRuns()).runs.map((summary) => summary.runId)).toContain(run.runId);
    expect((await fluxiq.getRun(run.runId)).state).toBe("achieved");
  });
});
