// The build's judged trial a saved Flow carries (t662): recorded at apply from
// the proposal's own `created` event, read back strictly, removed by an apply
// whose build judged none, and speaking only for a run of the versions apply
// saved.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowInstructionDigest, type AutomationStudioFlowGraphVersion } from "../../index.ts";
import {
  AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY,
  automationStudioAppliedJudgedBuildTrial,
  automationStudioFlowJudgedBuildTrialFromMetadata,
  automationStudioMetadataWithJudgedBuildTrial,
  automationStudioRanJudgedVersions,
  type AutomationStudioAppliedJudgedBuildTrialAdaptation,
  type AutomationStudioFlowJudgedBuildTrial
} from "../index.ts";

const REQUEST = [{ title: "Seed packets", body: "List the nursery's open-pollinated tomato seed packets with their price." }];
const DIGEST = automationStudioFlowInstructionDigest(REQUEST)!;
const created = (candidateTrial: JsonObject | undefined): AutomationStudioAppliedJudgedBuildTrialAdaptation["auditEvents"] =>
  [{ eventType: "created", detail: candidateTrial ? { candidateTrial } : {} }, { eventType: "approved", detail: {} }];
const adaptation = (candidateTrial: JsonObject | undefined): AutomationStudioAppliedJudgedBuildTrialAdaptation => ({
  adaptationId: "adaptation.nursery",
  auditEvents: created(candidateTrial),
  topology: { subflows: [{ subflow: { subflowId: "subflow.primary" }, graphFlow: { flowId: "flow.nursery.primary" } }] }
});
const YES = { candidateId: "candidate.1", revision: 3, digest: "candidate-digest", trial: { runId: "trial.nursery-1", verdict: "yes", calls: 2, start: "reset" }, trials: 3 };
const graphs: Record<string, number | undefined> = { "flow.nursery": undefined, "flow.nursery.primary": 4 };
const read = (flowId: string) => ({ flowId, ...(graphs[flowId] === undefined ? {} : { metadata: { graphRevision: graphs[flowId]! } }) });

async function applied(candidateTrial: JsonObject | undefined, instructions: readonly { title?: string; body?: string }[] = REQUEST): Promise<{ trial: AutomationStudioFlowJudgedBuildTrial | undefined; reads: string[] }> {
  const reads: string[] = [];
  const trial = await automationStudioAppliedJudgedBuildTrial({
    adaptation: adaptation(candidateTrial), parent: read("flow.nursery"),
    readGraph: async (flowId) => {
      reads.push(flowId);
      return read(flowId);
    },
    instructions: async () => {
      reads.push("instructions");
      return instructions;
    }
  });
  return { trial, reads };
}

describe("the judged trial apply records", () => {
  it("names the proposal's yes trial, its calls, the request's digest and the versions apply saved", async () => {
    const { trial } = await applied(YES);
    expect(trial).toEqual({
      trialRunId: "trial.nursery-1", verdict: "yes", calls: 2, instructionDigest: DIGEST, adaptationId: "adaptation.nursery",
      versions: [{ graphFlowId: "flow.nursery", revision: null }, { graphFlowId: "flow.nursery.primary", revision: 4, subflowId: "subflow.primary" }]
    });
  });

  it("is nothing, and reads nothing, where the proposal names no yes trial", async () => {
    for (const candidateTrial of [undefined, { ...YES, trial: { ...YES.trial, verdict: "no" } }, { ...YES, trial: { ...YES.trial, runId: " " } }, { ...YES, trial: { ...YES.trial, calls: 0 } }, { ...YES, trial: "yes" }]) {
      const { trial, reads } = await applied(candidateTrial as JsonObject | undefined);
      expect(trial).toBeUndefined();
      expect(reads).toEqual([]);
    }
  });

  it("is nothing where the Flow states no request, so no digest can be compared", async () => {
    expect((await applied(YES, [{ title: " ", body: "" }])).trial).toBeUndefined();
  });

  it("holds ids, counts and a digest only: no request text reaches the record", async () => {
    const metadata = automationStudioMetadataWithJudgedBuildTrial({ kept: true }, (await applied(YES)).trial);
    expect(JSON.stringify(metadata)).not.toContain("tomato");
    expect(metadata.kept).toBe(true);
  });
});

describe("the record on the Flow's metadata", () => {
  it("reads back as written, and an apply with no judged trial removes an earlier one", async () => {
    const { trial } = await applied(YES);
    const written = automationStudioMetadataWithJudgedBuildTrial({ kept: true }, trial);
    expect(automationStudioFlowJudgedBuildTrialFromMetadata(written)).toEqual(trial);
    const replaced = automationStudioMetadataWithJudgedBuildTrial(written, undefined);
    expect(replaced).toEqual({ kept: true });
    expect(automationStudioFlowJudgedBuildTrialFromMetadata(replaced)).toBeUndefined();
  });

  it("reads a damaged record as none", async () => {
    const { trial } = await applied(YES);
    const written = automationStudioMetadataWithJudgedBuildTrial(undefined, trial)[AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY] as JsonObject;
    for (const damaged of [{ ...written, verdict: "unsure" }, { ...written, calls: 1.5 }, { ...written, trialRunId: "" }, { ...written, instructionDigest: null }, { ...written, versions: [] }, { ...written, versions: [{ revision: 2 }] }, "yes"]) {
      expect(automationStudioFlowJudgedBuildTrialFromMetadata({ [AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY]: damaged as JsonObject })).toBeUndefined();
    }
  });
});

describe("which run the record speaks for", () => {
  const saved: AutomationStudioFlowGraphVersion[] = [{ graphFlowId: "flow.nursery", revision: null }, { graphFlowId: "flow.nursery.primary", revision: 4, subflowId: "subflow.primary" }];

  it("a run of exactly the versions apply saved", () => {
    expect(automationStudioRanJudgedVersions(saved, [{ graphFlowId: "flow.nursery", revision: null }, { graphFlowId: "flow.nursery.primary", revision: 4, subflowId: "subflow.primary" }])).toBe(true);
  });

  it("no run of a repaired graph, a graph apply did not save, a newly numbered parent, or no version at all", () => {
    expect(automationStudioRanJudgedVersions(saved, [{ graphFlowId: "flow.nursery", revision: null }, { graphFlowId: "flow.nursery.primary", revision: 5, subflowId: "subflow.primary" }])).toBe(false);
    expect(automationStudioRanJudgedVersions(saved, [{ graphFlowId: "flow.nursery", revision: null }, { graphFlowId: "flow.nursery.other", revision: 4, subflowId: "subflow.other" }])).toBe(false);
    expect(automationStudioRanJudgedVersions(saved, [{ graphFlowId: "flow.nursery", revision: 1 }, { graphFlowId: "flow.nursery.primary", revision: 4, subflowId: "subflow.primary" }])).toBe(false);
    expect(automationStudioRanJudgedVersions(saved, [])).toBe(false);
  });

  it("never on unnumbered graphs alone, and never an unnumbered Subflow graph", () => {
    expect(automationStudioRanJudgedVersions(saved, [{ graphFlowId: "flow.nursery", revision: null }])).toBe(false);
    const unnumbered: AutomationStudioFlowGraphVersion[] = [{ graphFlowId: "flow.nursery", revision: 2 }, { graphFlowId: "flow.nursery.primary", revision: null, subflowId: "subflow.primary" }];
    expect(automationStudioRanJudgedVersions(unnumbered, unnumbered)).toBe(false);
  });
});
