// The judged-trial port read off the saved Flow (t662), driven through the
// run's result check: a playback of the versions a build's judged-yes trial
// passed, with the trial's very rows and a double no, is unverified; any other
// rows, version, scope or an unreadable Flow refute as before. A county
// library's catalogue, not any scenario a live run uses.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  automationStudioFlowInstructionDigest,
  automationStudioMetadataWithFlowVersions,
  automationStudioMetadataWithJudgedBuildTrial,
  type AutomationStudioFlowGraphVersion
} from "../../../flow-version/index.ts";
import { datasetSummary, ANSWER, harness, instruction, session, verify } from "../../tests/run-outcome-harness.ts";
import { AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES, automationStudioResultJudgedBuildTrialOfSavedFlow } from "../index.ts";

const REQUEST = instruction("List the county library's large-print mysteries on the shelf, with title and branch.");
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "branch", label: "Branch", valueType: "string" }] };
const BOOKS: JsonObject[] = [{ title: "The Quarry Lane Affair", branch: "Eastgate" }, { title: "A Lantern at Low Tide", branch: "Millbrook" }];
const TRIAL_RUN = "trial.library-1";
const SAVED: AutomationStudioFlowGraphVersion[] = [{ graphFlowId: "flow-1", revision: null }, { graphFlowId: "flow-1.primary", revision: 3, subflowId: "subflow.primary" }];
const RECORD = { trialRunId: TRIAL_RUN, verdict: "yes" as const, calls: 2, instructionDigest: automationStudioFlowInstructionDigest([REQUEST])!, adaptationId: "adaptation.library", versions: SAVED };

/** The run's result check with the service's port over a saved Flow whose metadata is `flowMetadata`. */
function checked(options: { trialRows?: JsonObject[]; flowMetadata?: () => Promise<JsonObject | undefined> } = {}) {
  const context = harness({ answer: ANSWER.no, instructions: [REQUEST], schema: SCHEMA, rows: BOOKS });
  const stored: Record<string, JsonObject[]> = { "run-1": BOOKS, [TRIAL_RUN]: options.trialRows ?? BOOKS };
  const summary = (runId: string): AutomationStudioRunDatasetSummary => datasetSummary({ runId, datasetId: runId === TRIAL_RUN ? "trial-books" : "books", recordCount: stored[runId]!.length });
  context.ports.listRunDatasets = async ({ runId }) => [summary(runId)];
  context.ports.getRunDatasetPage = async ({ runId }) => ({ summary: summary(runId), schema: SCHEMA, rows: stored[runId]!.map((row) => ({ ...row })), nextCursor: null });
  const reads: string[] = [];
  context.ports.judgedBuildTrial = automationStudioResultJudgedBuildTrialOfSavedFlow({
    flowMetadata: async (_projectId, flowId) => {
      reads.push(flowId);
      return await (options.flowMetadata ?? (async () => automationStudioMetadataWithJudgedBuildTrial({ bootstrapAdaptationId: "adaptation.library" }, RECORD)))();
    }
  });
  return Object.assign(context, { reads });
}
const ran = (versions: AutomationStudioFlowGraphVersion[]) => ({ session: session({ metadata: automationStudioMetadataWithFlowVersions(undefined, versions) }) });

describe("the build's judged trial, read off the saved Flow", () => {
  it("holds a playback of the versions it passed, with its very rows, unverified", async () => {
    const context = checked();
    const next = await verify(context, ran(SAVED));
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "unverified", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES });
    expect(context.reads).toEqual(["flow-1"]);
  });

  it("refutes as before where the rows differ", async () => {
    const next = await verify(checked({ trialRows: [BOOKS[0]!] }), ran(SAVED));
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", basis: "model", code: "core.result.does_not_answer_request" });
  });

  it("refutes as before for a run of another revision, a run that recorded no versions, or a Flow that carries no record", async () => {
    const repaired = [SAVED[0]!, { ...SAVED[1]!, revision: 4 }];
    for (const [context, overrides] of [[checked(), ran(repaired)], [checked(), ran([])], [checked({ flowMetadata: async () => ({ bootstrapAdaptationId: "adaptation.library" }) }), ran(SAVED)]] as const) {
      const next = await verify(context, overrides);
      expect((next.metadata?.resultVerification as JsonObject).status).toBe("refuted");
    }
  });

  it("never refutes nor holds where the saved Flow cannot be read, and names no trial for a Subflow-scoped run", async () => {
    const unreadable = await verify(checked({ flowMetadata: async () => { throw new Error("SQLITE_BUSY"); } }), ran(SAVED));
    // The read's failure is the check's own: it ends unverified, saying the check did not finish, not a refutation on a doubt Core could not settle.
    expect(unreadable.metadata?.resultVerification).toMatchObject({ status: "unverified", code: "core.result.verification_did_not_finish" });
    const scoped = checked();
    const port = scoped.ports.judgedBuildTrial!;
    await expect(port({ projectId: "project-1", flowId: "flow-1", subflowId: "subflow.primary", runId: "run-1", flowVersions: SAVED })).resolves.toBeUndefined();
    expect(scoped.reads).toEqual([]);
  });

  it("names no trial to the trial's own run", async () => {
    const port = checked().ports.judgedBuildTrial!;
    await expect(port({ projectId: "project-1", flowId: "flow-1", runId: TRIAL_RUN, flowVersions: SAVED })).resolves.toBeUndefined();
    await expect(port({ projectId: "project-1", flowId: "flow-1", runId: "run-1", flowVersions: SAVED })).resolves.toEqual({ trialRunId: TRIAL_RUN, verdict: "yes", calls: 2, instructionDigest: RECORD.instructionDigest });
  });
});
