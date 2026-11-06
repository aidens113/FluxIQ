// @fluxiq-test-group real-sql
// The row an attempt writes at a wait names its result's dataset and how many rows that holds, and the
// dataset serves exactly that while the attempt waits (`../keep.ts`). Seen live in run-mw43h5ew-a04a583d: the
// same rows read seven times stood in the store as 28 collected rows while the row said 4, because only an
// ending processed the dataset, and a wait for a person is no ending.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { held, keptAttempt, noWaiting, pendingAsk } from "../../tests/endings/support.ts";
import { LOANS_OUTPUT } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, runNode, scriptedAttempt } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const WRONG_LIST = "the wrong list";
/** A read of a list that is not there, every time: what makes the attempt get stuck and ask. */
const failing = (call: { value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult | undefined => (call.value.parameters as JsonObject | undefined)?.from === WRONG_LIST
  ? { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_not_found" }, effectApplied: false, resultCode: "web.action.rejected.target_not_found", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "dispatch" } }
  : undefined;

describe("an attempt waiting for a person", () => {
  it("serves from its result's dataset the rows its row says, though the same rows were read more than once", async () => {
    const hold = held();
    const generating = scriptedAttempt({
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      fault: failing,
      script: [
        // The same list twice, asked differently so each really runs: the store keeps both batches as collected.
        runNode("read.1", READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: 1 }, [], { add: true }),
        runNode("read.2", READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: 2 }, [], {}),
        ...Array.from({ length: 200 }, () => runNode("read.stuck", READ_LOANS, { from: WRONG_LIST }, [], {}))
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    const kept = await keptAttempt(service, projectId, flowId);
    expect(kept?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" });
    const rows = kept?.result?.rows;
    expect(rows?.totalRows).toBe(3);
    const page = await service.runDatasets.getRunDatasetPage({ projectId, runId: rows!.runId, datasetId: rows!.datasetId, limit: 200 });
    expect(page?.rows).toHaveLength(3);
    expect(page?.summary.recordCount).toBe(3);
    expect(page?.summary.processing).toMatchObject({ collected: 6, duplicates: 3, kept: 3 });
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: "stuck_stop" });
    await generating;
  });
});
