// A passing test captures the page it ended on, for the judge of the build
// (t174-w89; t174-w87 Cause 7, run `run-murwd8le-79e735a8`).
//
// The test's last step there was Add to cart, which answered `replayed` with no
// page, so the judges (0046, 0047) read outcome words and never saw `Cart (3)`.
// The gate now asks the build for one look right after a replay passes and
// puts it on the report; a reuse of that replay reports the same look, and a
// look that fails or answers nothing leaves the report without one.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioFlowDraftDryRunGate, type AutomationStudioFlowDraftTestReport } from "../index.ts";

const ITEM = { location: "https://store.test/item/1" };
const PAGE = "PAGE \"Voltbay USB C Hub\"\nt885 link \"3 Cart\" ~/cart";

const step = (position: number): AutomationStudioFlowDraftStep => ({
  position, iteration: position, actionId: `node.${position}`, toolId: "core.run_node",
  input: { node: `node.${position}`, parameters: {}, consequences: [] },
  ranWith: { node: `node.${position}`, parameters: {}, consequences: [] },
  effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, replay: { from: ITEM }
});

function host(failing?: number) {
  return vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    const code = value.node === `node.${failing}` ? "core.replay.failed" : "core.replay.replayed";
    return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: code === "core.replay.replayed", resultCode: code };
  });
}

function gate(steps: AutomationStudioFlowDraftStep[], endView: (request: { callId: string; after?: number; signal?: AbortSignal }) => Promise<{ after?: number | string; view: JsonObject } | undefined>, failing?: number) {
  const reports: AutomationStudioFlowDraftTestReport[] = [];
  const run = automationStudioFlowDraftDryRunGate({
    enabled: true, steps, executeTool: host(failing), accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined,
    observed: (report) => { reports.push(report); }, endView
  });
  return { run, reports };
}

describe("the page a passing test ended on", () => {
  it("is looked at once, after the replay's last step, and goes on the report", async () => {
    const endView = vi.fn(async (request: { callId: string; after?: number }) => ({ ...(request.after === undefined ? {} : { after: request.after }), view: { page: PAGE } }));
    const { run, reports } = gate([step(1), step(2)], endView);
    expect(await run()).toBeUndefined();
    expect(endView).toHaveBeenCalledTimes(1);
    expect(endView.mock.calls[0]?.[0]).toMatchObject({ callId: "core.dry_run.1.end_view", after: 2 });
    expect(reports[0]?.endView).toEqual({ after: 2, view: { page: PAGE } });
  });

  it("is the same look when the same Flow's clean replay is reused, and is not looked at again", async () => {
    const endView = vi.fn(async () => ({ after: 1, view: { page: PAGE } }));
    const { run, reports } = gate([step(1)], endView);
    await run();
    await run();
    expect(endView).toHaveBeenCalledTimes(1);
    expect(reports.map((report) => [report.reused, report.endView])).toEqual([[false, { after: 1, view: { page: PAGE } }], [true, { after: 1, view: { page: PAGE } }]]);
  });

  it("is not looked at for a refused replay", async () => {
    const endView = vi.fn(async () => ({ view: { page: PAGE } }));
    const { run, reports } = gate([step(1), step(2)], endView, 2);
    expect(await run()).toMatchObject({ issueCodes: expect.any(Array) });
    expect(endView).not.toHaveBeenCalled();
    expect(reports).toEqual([]);
  });

  it("leaves the report without one when the look fails or answers nothing, and the test still passes", async () => {
    for (const endView of [vi.fn(async () => { throw new Error("tab closed"); }), vi.fn(async () => undefined)]) {
      const { run, reports } = gate([step(1)], endView);
      expect(await run()).toBeUndefined();
      expect(reports[0]).toBeDefined();
      expect(reports[0]).not.toHaveProperty("endView");
    }
  });
});
