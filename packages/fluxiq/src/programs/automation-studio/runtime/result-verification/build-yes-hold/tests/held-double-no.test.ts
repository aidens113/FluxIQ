// A playback's double no on the rows its build's two yeses judged is recorded
// unverified, not refuted (t660, A8 frozen pair 6 candidate
// `run-mvac1av6-f7b0f9e2`): the playback stored exactly the rows the build's
// test had, both judges said no, the run was failed and its Flow re-authored
// into a broken one. Driven end to end through the run's result check, on a
// hardware store's listing.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowInstructionDigest } from "../../../flow-version/index.ts";
import { ANSWER, datasetSummary, harness, instruction, verify, type Harness } from "../../tests/run-outcome-harness.ts";
import { AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES, automationStudioResultSameStoredRows, type AutomationStudioResultJudgedBuildTrial } from "../index.ts";

const REQUEST = instruction("List every cordless drill the hardware store sells itself, rated 4.5 or higher, with name and price.");
const DIGEST = automationStudioFlowInstructionDigest([REQUEST])!;
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] };
const DRILLS: JsonObject[] = [{ name: "Ironbark 18V Cordless Drill", price: "$89.00" }, { name: "Millrace 12V Compact Drill", price: "$59.00" }];
const TRIAL_RUN = "trial.build-1";
const TRIAL: AutomationStudioResultJudgedBuildTrial = { trialRunId: TRIAL_RUN, verdict: "yes", calls: 2, instructionDigest: DIGEST };

/** The run's result check with the build's trial named, each run's rows read from its own store. */
function checked(options: { trial?: AutomationStudioResultJudgedBuildTrial | undefined; trialRows?: JsonObject[]; answer?: string } = {}): Harness & { asked: number[] } {
  const context = harness({ answer: options.answer ?? ANSWER.no, instructions: [REQUEST], schema: SCHEMA, rows: DRILLS });
  const asked: number[] = [];
  const stored: Record<string, JsonObject[]> = { "run-1": DRILLS, [TRIAL_RUN]: options.trialRows ?? DRILLS };
  const summary = (runId: string): AutomationStudioRunDatasetSummary => datasetSummary({ runId, datasetId: runId === TRIAL_RUN ? "trial-drills" : "drills", recordCount: stored[runId]!.length });
  context.ports.listRunDatasets = async ({ runId }) => [summary(runId)];
  context.ports.getRunDatasetPage = async ({ runId }) => ({ summary: summary(runId), schema: SCHEMA, rows: stored[runId]!.map((row) => ({ ...row })), nextCursor: null });
  context.ports.judgedBuildTrial = async (input) => {
    asked.push(input.flowVersions.length);
    return "trial" in options ? options.trial : TRIAL;
  };
  return Object.assign(context, { asked });
}

describe("a playback's double no beside its build's two yeses", () => {
  it("is unverified, not refuted, where the playback stored exactly the rows the build's judged test stored", async () => {
    const context = checked();
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({
      status: "unverified", verdict: "unsure", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES,
      verdicts: ["does_not_answer", "does_not_answer"]
    });
    expect((next.metadata?.resultVerification as JsonObject).repair).toBeUndefined();
    expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toBeUndefined();
    expect(context.asked).toHaveLength(1);
  });

  it("refutes as before where the playback's rows differ from the trial's", async () => {
    const next = await verify(checked({ trialRows: [DRILLS[0]!, { name: "Ironbark 18V Cordless Drill Kit", price: "$119.00" }] }));
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request" });
  });

  it("refutes as before where the trial was no confirmed yes, was judged against another request, or is unknown", async () => {
    for (const trial of [{ ...TRIAL, calls: 1 }, { ...TRIAL, verdict: "unsure" as const }, { ...TRIAL, instructionDigest: "another" }, undefined]) {
      const next = await verify(checked({ trial }));
      expect(next.status).toBe("failed");
      expect((next.metadata?.resultVerification as JsonObject).status).toBe("refuted");
    }
  });

  it("never makes a yes, and is not asked about a result the judges did not refute", async () => {
    const context = checked({ answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.metadata?.resultVerification).toMatchObject({ status: "confirmed", verdict: "answers" });
    expect(context.asked).toHaveLength(0);
  });
});

describe("two runs' stored rows, by content", () => {
  const set = (rows: JsonObject[], fields: Partial<AutomationStudioRunDatasetSummary> = {}) => ({ summary: datasetSummary({ recordCount: rows.length, ...fields }), schema: SCHEMA, rows });

  it("are the same with the same fields and rows in the same order, whatever the dataset's id or a row's key order", () => {
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set(DRILLS.map((row) => ({ price: row.price!, name: row.name! })), { datasetId: "other" })])).toBe(true);
  });

  it("are not where the order, a value or the count differs, a set was cut, or neither holds a row", () => {
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set([...DRILLS].reverse())])).toBe(false);
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set([DRILLS[0]!])])).toBe(false);
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set(DRILLS, { truncated: true })])).toBe(false);
    expect(automationStudioResultSameStoredRows([set([])], [set([])])).toBe(false);
  });
});
