// The build trial of A8 towels `run-mvahlxuu-760d9e28`, replayed in its shape
// on a hardware store (t663): a candidate trial's judge is the build-test judge,
// sent a finished run's summary built from the trial's stored records
// (`service/candidate-trial/summary.ts`), so the stored cell values reach the
// verdict. Ten kept rows, one of them an organizer case with no unit price and
// a name that does not write "wood screws"; both judge calls answer yes without
// naming it. The yes is held, never taken and never a no, and the recheck it
// is asked again with names the row.
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { ORGANIZER, SCREW_PACKS } from "../../request-rows/tests/kept-rows-fixture.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";

const REQUEST = "Collect every pack of wood screws from the fastener aisle with its name, price and unit price.";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "task", title: "Collect the wood screws", body: REQUEST,
  scope: { kind: "flow", projectId: "project", flowId: "flow" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["name", "price", "unitPrice"].map((id) => ({ id, label: id, valueType: "string" })) };
const dataset: AutomationStudioRunDatasetSummary = { runId: "trial.1", datasetId: "screws", nodeIds: ["read"], schemaDigest: "digest", recordCount: 10, truncated: false, invalidCount: 0, updatedAt: 1 };

/** The trial's ten stored rows: nine packs with every column, and the organizer, ninth as in the run, with no unit price. */
const rows = [...SCREW_PACKS.slice(0, 8), ORGANIZER, SCREW_PACKS[8]!].map((name, index) => name === ORGANIZER
  ? { name, price: "$12.97" }
  : { name, price: `$${(6 + index).toFixed(2)}`, unitPrice: `$0.0${index + 1}/ct` });

const summary = summarizeAutomationStudioRunResult({ recordSets: [{ summary: dataset, schema, rows }], deniedEvidenceKeys: [] });

/** A provider that answers yes every time with `observed`, keeping each request it was sent. */
function yesProvider(observed: string): { provider: AutomationStudioLlmProvider; sent: string[] } {
  const sent: string[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      sent.push(JSON.stringify(request));
      return {
        response: { kind: "diagnosis", summary: "Checked.", diagnosis: { answersRequest: "yes", expected: "Every pack of wood screws with name, price and unit price.", observed, patchNeeded: false } },
        usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 }
      };
    }
  };
  return { provider, sent };
}

const judge = (provider: AutomationStudioLlmProvider) => automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project", flowId: "flow", provider })({ summary, budget: { maxCostUsd: 0.2 } });

describe("a build trial's yes over a kept row unlike the rest", () => {
  it("reaches the judge with the stored values: all ten rows, the organizer without a unit price", () => {
    expect(summary.recordSets[0]!.sampleRows).toHaveLength(10);
    expect(summary.recordSets[0]!.sampleRows!.find((row) => row.name === ORGANIZER)).not.toHaveProperty("unitPrice");
  });

  it("is held when neither call names the row, and the recheck names it", async () => {
    const { provider, sent } = yesProvider("10 rows stored, each a pack of wood screws with its name, price and unit price; no requested item is missing.");
    const judged = await judge(provider);
    expect(judged.verdict).toBe("not_judged");
    expect(judged).toMatchObject({ yesUnconfirmed: true });
    // Two calls, each asked once more with Core's lines.
    expect(sent).toHaveLength(4);
    const rechecks = sent.slice(1).filter((request) => request.includes("Where a line names rows the result keeps"));
    expect(rechecks.length).toBeGreaterThan(0);
    expect(rechecks[0]).toContain(ORGANIZER);
    expect(rechecks[0]).toContain("with no value in the column");
    expect(rechecks[0]).toContain("unitPrice");
    // And by the item phrase every other kept row's name writes (fix 1b).
    expect(rechecks[0]).toContain("kept rows whose name does not write");
  });

  it("is taken when the calls name the row beside a quote of the request", async () => {
    const { provider } = yesProvider(`10 rows stored. The Ironleaf Wood Screw Organizer Case has no unit price; the request asks for "every pack of wood screws" and that case is sold with screws in it, so I keep it.`);
    expect((await judge(provider)).verdict).toBe("yes");
  });
});
