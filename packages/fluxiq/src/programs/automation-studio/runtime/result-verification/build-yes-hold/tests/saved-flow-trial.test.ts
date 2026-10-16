// The judged-trial port read off the saved Flow (t662), driven through the
// run's result check: a playback of the versions a build's judged-yes trial
// passed names that trial, routed to a Subflow or not (t664); any other
// version, a run of one part alone, a Flow without a record or the trial's own
// run names none, and says why; an unreadable Flow is a check that did not
// finish. A county library's catalogue, not any scenario a live run uses.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  automationStudioAppliedJudgedBuildTrial,
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
const NAMED = { trialRunId: TRIAL_RUN, verdict: "yes", calls: 2, instructionDigest: RECORD.instructionDigest };

/** Each judge's no, weighed by the real agreement (t663): a count Core's record refutes beside a claim it cannot check; that claim alone stands whole. */
const PART_REFUTED = { observed: "Only 5 rows were stored. A Lantern at Low Tide is not a large-print edition." };
const STANDS_WHOLE = { observed: "A Lantern at Low Tide is not a large-print edition." };

/** The run's result check with the service's port over a saved Flow whose metadata is `flowMetadata`. */
function checked(options: { trialRows?: JsonObject[]; flowMetadata?: () => Promise<JsonObject | undefined>; said?: Record<string, string> } = {}) {
  const context = harness({ answer: ANSWER.no, said: options.said ?? PART_REFUTED, instructions: [REQUEST], schema: SCHEMA, rows: BOOKS });
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
const because = (next: { metadata?: JsonObject | undefined }) => ((next.metadata?.resultVerification as JsonObject).buildYesHold as JsonObject).because;

describe("the build's judged trial, read off the saved Flow", () => {
  it("is named to a playback its router sent to a Subflow, as the service checks every routed run (t664)", async () => {
    // A8 towels `run-mvahlxuu-760d9e28`: the service hands the check the Subflow its router chose, and this port named no trial to any such run.
    const context = checked();
    const port = context.ports.judgedBuildTrial!;
    await expect(port({ projectId: "project-1", flowId: "flow-1", subflowId: "subflow.primary", runId: "run-1", flowVersions: SAVED })).resolves.toEqual(NAMED);
    await expect(port({ projectId: "project-1", flowId: "flow-1", runId: "run-1", flowVersions: SAVED })).resolves.toEqual(NAMED);
    // Through the check, routed: every precondition of the trial holds, and two nos Core's record refutes in part are set aside, unverified.
    const next = await verify(context, { ...ran(SAVED), subflowId: "subflow.primary" });
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "unverified", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES, buildYesHold: { held: true, because: "held" } });
    expect(context.reads).toEqual(["flow-1", "flow-1", "flow-1"]);
    // The same routed playback whose nos stand whole is refuted.
    const standing = await verify(checked({ said: STANDS_WHOLE }), { ...ran(SAVED), subflowId: "subflow.primary" });
    expect(standing.status).toBe("failed");
    expect(standing.metadata?.resultVerification).toMatchObject({ status: "refuted", buildYesHold: { held: false, because: "no_stands_whole" } });
  });

  it("carries a re-asked trial yes from apply to the check, which never holds to it; a first-ask yes is carried as two calls", async () => {
    // Apply's own record, from the proposal's audit as promotion writes it: the debugged towels trial's yes came after its two nos were asked again, four calls.
    const appliedFrom = async (calls: number) => await automationStudioAppliedJudgedBuildTrial({
      adaptation: { adaptationId: "adaptation.library", auditEvents: [{ eventType: "created", detail: { candidateTrial: { trial: { runId: TRIAL_RUN, verdict: "yes", calls, start: "reset" } } } }],
        topology: { subflows: [{ subflow: { subflowId: "subflow.primary" }, graphFlow: { flowId: "flow-1.primary" } }] } },
      parent: { flowId: "flow-1" },
      readGraph: async (flowId) => ({ flowId, metadata: { graphRevision: 3 } }),
      instructions: async () => [REQUEST]
    });
    const reasked = await appliedFrom(4);
    expect(reasked).toMatchObject({ trialRunId: TRIAL_RUN, calls: 4, versions: SAVED });
    const next = await verify(checked({ flowMetadata: async () => automationStudioMetadataWithJudgedBuildTrial({}, reasked) }), { ...ran(SAVED), subflowId: "subflow.primary" });
    expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", buildYesHold: { held: false, because: "trial_not_confirmed" } });
    // A first-ask two-call yes, carried the same way, holds the same partly refuted double no.
    const firstAsk = await appliedFrom(2);
    expect(because(await verify(checked({ flowMetadata: async () => automationStudioMetadataWithJudgedBuildTrial({}, firstAsk) }), { ...ran(SAVED), subflowId: "subflow.primary" }))).toBe("held");
  });

  it("carries the trial's first-ask flag from apply to the check, which reads it in place of the call count (t677)", async () => {
    // Apply's record from the proposal's audit, as promotion writes it with the trial record's flag.
    const appliedFrom = async (calls: number, firstAskConfirmed: unknown) => await automationStudioAppliedJudgedBuildTrial({
      adaptation: { adaptationId: "adaptation.library", auditEvents: [{ eventType: "created", detail: { candidateTrial: { trial: { runId: TRIAL_RUN, verdict: "yes", calls, start: "reset", firstAskConfirmed } as JsonObject } } }],
        topology: { subflows: [{ subflow: { subflowId: "subflow.primary" }, graphFlow: { flowId: "flow-1.primary" } }] } },
      parent: { flowId: "flow-1" },
      readGraph: async (flowId) => ({ flowId, metadata: { graphRevision: 3 } }),
      instructions: async () => [REQUEST]
    });
    const check = async (record: Awaited<ReturnType<typeof appliedFrom>>) => because(await verify(checked({ flowMetadata: async () => automationStudioMetadataWithJudgedBuildTrial({}, record) }), { ...ran(SAVED), subflowId: "subflow.primary" }));
    // A confirmed yes behind a timed-out first call: three calls, held.
    const retried = await appliedFrom(3, true);
    expect(retried).toMatchObject({ calls: 3, firstAskConfirmed: true });
    expect(await check(retried)).toBe("held");
    // A two-call yes its verification says was re-asked of another verdict: not held to.
    expect(await check(await appliedFrom(2, false))).toBe("trial_not_confirmed");
    // A proposal made before the flag, or with no flag in it: the count decides, as before.
    const unflagged = await appliedFrom(3, "yes");
    expect(unflagged).not.toHaveProperty("firstAskConfirmed");
    expect(await check(unflagged)).toBe("trial_not_confirmed");
  });

  it("finds the rows differ where they do", async () => {
    expect(because(await verify(checked({ trialRows: [BOOKS[0]!] }), ran(SAVED)))).toBe("rows_differ");
  });

  it("names none to a run of another revision, of one part alone, or that recorded no versions", async () => {
    const repaired = [SAVED[0]!, { ...SAVED[1]!, revision: 4 }];
    for (const versions of [repaired, [SAVED[1]!], []]) {
      const next = await verify(checked(), ran(versions));
      expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", buildYesHold: { held: false, because: "revision_mismatch" } });
    }
    const port = checked().ports.judgedBuildTrial!;
    await expect(port({ projectId: "project-1", flowId: "flow-1", subflowId: "subflow.primary", runId: "run-1", flowVersions: [SAVED[1]!] })).resolves.toEqual({ missing: "revision_mismatch" });
  });

  it("names none where the Flow carries no record, nor to the trial's own run", async () => {
    expect(because(await verify(checked({ flowMetadata: async () => ({ bootstrapAdaptationId: "adaptation.library" }) }), ran(SAVED)))).toBe("no_build_trial");
    const port = checked().ports.judgedBuildTrial!;
    await expect(port({ projectId: "project-1", flowId: "flow-1", runId: TRIAL_RUN, flowVersions: SAVED })).resolves.toEqual({ missing: "no_build_trial" });
  });

  it("never refutes nor holds where the saved Flow cannot be read", async () => {
    const unreadable = await verify(checked({ flowMetadata: async () => { throw new Error("SQLITE_BUSY"); } }), ran(SAVED));
    // The read's failure is the check's own: it ends unverified, saying the check did not finish, not a refutation on a doubt Core could not settle.
    expect(unreadable.metadata?.resultVerification).toMatchObject({ status: "unverified", code: "core.result.verification_did_not_finish" });
  });
});
