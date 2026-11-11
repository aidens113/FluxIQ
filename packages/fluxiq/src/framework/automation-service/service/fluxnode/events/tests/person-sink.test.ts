// The person sink's wait under a run's personWaitMs (W3, t899): a developer's value governs over the
// expiry an ask carries (Core's default); with none given, the nearer deadline still wins.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAsk } from "../../../../../../runtime/automation-parking/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../../../../runtime/run-overrides/index.ts";
import { FluxNodeRun } from "../../fluxnode-run.ts";
import { fluxNodePersonSink } from "../person-sink.ts";

const ASK = { askId: "ask.1", kind: "choice", text: "Complete the check.", options: [{ id: "done", label: "Continue" }] } as unknown as AutomationStudioAsk;

function setup(waitMs: number) {
  const run = new FluxNodeRun("run.1", { name: "n", specHash: "h", projectId: "p", flowId: "f", flowPath: "x" }, { inputs: {} }, "events", () => 1_000);
  return { run, sink: fluxNodePersonSink(run, waitMs, () => 1_000) };
}
const waitUntilOf = (run: FluxNodeRun) => (run.eventsAfter(0).find((event) => event.type === "person_needed") as { waitUntil: number } | undefined)?.waitUntil;

describe("the person sink's wait", () => {
  it("holds to the nearer deadline without a frame, as before", async () => {
    const { run, sink } = setup(600_000);
    await sink.answer!(ASK, { expiresAtMs: 1_030 });
    expect(waitUntilOf(run)).toBe(1_030);
  });

  it("lets a run's personWaitMs outlast the default expiry its ask carries, and still waits for the person", async () => {
    const { run, sink } = setup(60);
    const started = Date.now();
    const answered = await runWithAutomationStudioRunOverrides({ deadlines: { personWaitMs: 60 } }, () => sink.answer!(ASK, { expiresAtMs: 1_010 }));
    expect(answered).toBeUndefined();
    expect(waitUntilOf(run)).toBe(1_060);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
  });

  it("gives two concurrent runs their own wait", async () => {
    const a = setup(20);
    const b = setup(600_000);
    await Promise.all([
      runWithAutomationStudioRunOverrides({ deadlines: { personWaitMs: 20 } }, () => a.sink.answer!(ASK, { expiresAtMs: 1_005 })),
      b.sink.answer!(ASK, { expiresAtMs: 1_040 })
    ]);
    expect(waitUntilOf(a.run)).toBe(1_020);
    expect(waitUntilOf(b.run)).toBe(1_040);
  });
});
