// @fluxiq-test-group real-sql
// A saved Flow's run, given the service's own graph-entry input authority (t905 unit B): the layers the run really
// assembled are authenticated at its root entry through the service's durable input owner, an inherited layer with no
// declared origin stays unknown, and either way the run itself is unchanged.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioInputUseObservation } from "../../../../../../engine/automation/input-use/index.ts";
import type { AutomationStudioInputScope } from "../../../../../../runtime/input-basis/index.ts";
import { AutomationStudioInputBasisStore, AutomationStudioInputUseExecutions } from "../../../input-basis/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, renewEveryLoan, type FlowRunFixture } from "../../tests/fake-library-engine.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

function opted(fixture: FlowRunFixture): { scope: AutomationStudioInputScope; seen: AutomationStudioInputUseObservation[] } {
  const scope: AutomationStudioInputScope = { projectId: fixture.projectId, taskId: "task.loans", principalId: "person.reader", producerId: "answer-first.flow-run" };
  const seen: AutomationStudioInputUseObservation[] = [];
  const executions = AutomationStudioInputUseExecutions.of(fixture.service);
  fixture.ports.inputUse = { open: entry => executions.open(scope, entry), observed: observation => { seen.push(observation); } };
  return { scope, seen };
}

describe("a saved Flow run's graph-entry input authority", () => {
  it("seals the caller's inputs at the run's root entry through the service's own durable owner", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    fixture.ports.input.caller = { inputs: { note: "renew politely" } };
    const { scope, seen } = opted(fixture);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    const store = new AutomationStudioInputBasisStore(fixture.service.projectPaths, fixture.service.projects, fixture.service.runDatasets);
    const entry = await store.read(scope), caller = await store.read({ ...scope, producerId: `${scope.producerId}.caller` });
    expect(seen[0]!.status === "sealed" && seen[0]!.reference).toEqual(entry?.head?.reference);
    expect(entry?.head?.producers).toEqual([{ role: "caller", reference: caller?.head?.reference }]);
    expect(JSON.stringify(seen)).not.toContain("renew politely");
  });

  it("keeps an inherited engine input with no declared origin unknown, and runs the Flow exactly as it would", async () => {
    const fixture = await flowRunFixture({ engine: engine => ({ ...engine, graphOptions: input => ({ ...engine.graphOptions(input), inputs: { inherited: "from elsewhere" } }) }) }, cleanups);
    const { scope, seen } = opted(fixture);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
    expect(seen).toEqual([{ status: "unknown", code: "origin_unverified" }]);
    const store = new AutomationStudioInputBasisStore(fixture.service.projectPaths, fixture.service.projects, fixture.service.runDatasets);
    expect(await store.read(scope)).toBeUndefined();
  });
});
