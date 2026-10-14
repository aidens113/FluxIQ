// A project build's judges read its task checklist beside the instructions
// (unit A9): a whole trial the record's latest task spec, a subflow trial its
// brief's parts and the whole task's notAsked. A candidate build, which binds
// no record, sends its judge nothing new. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectTaskSpec } from "../../../project-agents/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { trialFixture } from "../../candidate-trial/tests/fixtures.ts";
import { automationStudioProjectBuildWholeTrials } from "../index.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "../task-checklist.ts";

const BINDING = { domainId: "isolated", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: {}, effectApplied: false, targetsUnchanged: true }) };
const REF = { projectId: "project", flowId: "parent", buildId: "build.1" };

const spec = (notAsked: string[], digest: string): AutomationStudioProjectTaskSpec => ({
  parts: [
    { id: "p1", quote: { sourceId: "instruction", text: "open the archive index" }, goalFacts: ["The archive index is shown"], lastingActs: [] },
    { id: "p2", quote: { sourceId: "instruction", text: "record each volume's title" }, goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"] }
  ],
  notAsked, digest
});

/** A record store holding two task specs, the later one under plan `plan.2`, and nothing else the checklist reads. */
function records(): Pick<AutomationStudioProjectBuildRecordStore, "read"> {
  const taskSpecs = [{ revision: 1, recordedAt: 1, taskSpec: spec(["An earlier reading"], "spec.1") }, { revision: 2, recordedAt: 2, taskSpec: spec(["Keeping only volumes from one decade"], "spec.2") }];
  const plans = [{ revision: 1, recordedAt: 1, plan: { taskSpecDigest: "spec.1", digest: "plan.1" } }, { revision: 2, recordedAt: 2, plan: { taskSpecDigest: "spec.2", digest: "plan.2" } }];
  return { read: async () => ({ record: { taskSpecs, plans }, returns: [] }) } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;
}

/** A whole trial whose one press lands, judged over a provider that keeps what it is sent. */
function wholeTrial() {
  const fixture = trialFixture([]);
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
  const { judge: _judge, ...environment } = fixture.ports;
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider = mockProvider(async (request) => {
    seen.push(structuredClone(request));
    return judgeReply("yes");
  });
  const judge = { provider, instructions: [] };
  return { fixture, environment, judge, seen };
}

const sectionOf = (request: AutomationStudioLlmTaskRequest | undefined) => (request?.context.resultSummary as unknown as { taskChecklist?: Record<string, unknown> } | undefined)?.taskChecklist;

describe("a whole trial's judge", () => {
  it("in a candidate build, with no record bound, is sent no checklist", async () => {
    const trial = wholeTrial();
    const result = await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: trial.environment, binding: BINDING, judge: trial.judge }).port(trial.fixture.request());
    expect(result.verdict).toBe("yes");
    expect(trial.seen.length).toBeGreaterThan(0);
    for (const request of trial.seen) expect(request.context.resultSummary).not.toHaveProperty("taskChecklist");
  });

  it("in a project build, is sent the record's latest task spec: every part and what nobody asked for", async () => {
    const trial = wholeTrial();
    AutomationStudioProjectBuildTaskChecklist.bind(trial.environment, { records: records(), ref: REF });
    await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: trial.environment, binding: BINDING, judge: trial.judge }).port(trial.fixture.request());
    expect(trial.seen.length).toBeGreaterThan(0);
    for (const request of trial.seen) {
      expect(sectionOf(request)).toMatchObject({
        supplementary: expect.stringContaining("The instructions are the only authority"),
        asked: [
          { part: "p1", words: "open the archive index", goalFacts: ["The archive index is shown"], lastingActs: [] },
          { part: "p2", words: "record each volume's title", goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"] }
        ],
        notAsked: ["Keeping only volumes from one decade"]
      });
    }
  });
});

describe("a subflow trial's checklist", () => {
  const scope = (planDigest: string): AutomationStudioSubflowScope => ({
    buildId: "build.1", briefId: "brief.record", planDigest, subflowKey: "record", predecessors: [],
    parts: [{ partId: "p2", sourceId: "instruction", text: "record each volume's title" }]
  });

  it("holds the brief's parts, as the task spec its plan names holds them, with the whole task's notAsked and the other parts as out of its scope", async () => {
    expect(await AutomationStudioProjectBuildTaskChecklist.subflow({ records: records(), ref: REF }, scope("plan.1"))).toEqual({
      parts: [{ id: "p2", words: "record each volume's title", goalFacts: ["Every volume's title is recorded"], lastingActs: ["create_new"] }],
      notAsked: ["An earlier reading"],
      outOfScope: [{ id: "p1", words: "open the archive index" }]
    });
  });

  // t594 (A8 launch 7): a first subflow also did the next subflow's lasting press, and its judges, told only its own parts, said yes.
  it("names no part as out of scope when the brief covers every part of the spec", async () => {
    const whole: AutomationStudioSubflowScope = { ...scope("plan.2"), parts: [{ partId: "p1", sourceId: "instruction", text: "open the archive index" }, { partId: "p2", sourceId: "instruction", text: "record each volume's title" }] };
    expect(await AutomationStudioProjectBuildTaskChecklist.subflow({ records: records(), ref: REF }, whole)).not.toHaveProperty("outOfScope");
  });

  it("falls back to the brief's own parts and words where the record holds no such spec", async () => {
    const empty = { read: async () => undefined } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;
    expect(await AutomationStudioProjectBuildTaskChecklist.subflow({ records: empty, ref: REF }, scope("plan.9"))).toEqual({
      parts: [{ id: "p2", words: "record each volume's title", goalFacts: [], lastingActs: [] }],
      notAsked: []
    });
  });
});
