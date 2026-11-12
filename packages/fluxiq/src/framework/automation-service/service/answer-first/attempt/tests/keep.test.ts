// @fluxiq-test-group real-sql
// The row an attempt writes at a wait names its result's dataset and how many rows that holds, and the
// dataset serves exactly that while the attempt waits (`../keep.ts`). Seen live in run-mw43h5ew-a04a583d: the
// same rows read seven times stood in the store as 28 collected rows while the row said 4, because only an
// ending processed the dataset, and a wait for a person is no ending. Since R7 a stuck attempt never waits
// (it is steered onto a fresh round), so the wait here is a check only a person can clear.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND } from "../../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { held, keptAttempt, noWaiting, pendingAsk } from "../../tests/endings/support.ts";
import { LOANS_OUTPUT } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, runNode, scriptedAttempt } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** A read that meets a check only a person can clear, as the web domain answers one: what makes the attempt wait. */
const check = (call: { value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "needs_person" }, effectApplied: false, personNeeded: true,
  draft: { actionId: String(call.value.node), input: call.value, effect: "observe", proposes: true, ranWith: { node: String(call.value.node), parameters: {} } }
});

describe("an attempt waiting for a person", () => {
  it("serves from its result's dataset the rows its row says, though the same rows were read more than once", async () => {
    const hold = held();
    const generating = scriptedAttempt({
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.checked === true ? check(call) : undefined,
      script: [
        // The same list twice, asked differently so each really runs: the store keeps both batches as collected.
        runNode("read.1", READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: 1 }, [], { add: true }),
        runNode("read.2", READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: 2 }, [], {}),
        runNode("read.checked", READ_LOANS, { checked: true }, [], {})
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    await pendingAsk(service, projectId, flowId, AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    // The row is written just after the question shows, so it is waited for rather than read once.
    await vi.waitFor(async () => expect((await keptAttempt(service, projectId, flowId))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "person_only_check" }), { timeout: 10_000, interval: 25 });
    const rows = (await keptAttempt(service, projectId, flowId))?.result?.rows;
    expect(rows?.totalRows).toBe(3);
    const page = await service.runDatasets.getRunDatasetPage({ projectId, runId: rows!.runId, datasetId: rows!.datasetId, limit: 200 });
    expect(page?.rows).toHaveLength(3);
    expect(page?.summary.recordCount).toBe(3);
    expect(page?.summary.processing).toMatchObject({ collected: 6, duplicates: 3, kept: 3 });
    service.buildCancellation.cancel(projectId, flowId);
    await generating;
  });
});
