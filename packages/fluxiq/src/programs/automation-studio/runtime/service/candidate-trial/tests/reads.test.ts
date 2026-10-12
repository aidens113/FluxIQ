// t466, lane D round 8 (`run-mv5jnc5m-a47c3e59`, revs 3 and 5): a listing whose two required conditions kept 0 of 8
// rows was told to the model as a wiring failure. A judged trial now says each read's rows seen and kept and what each
// condition rejected, and a read that kept none says it is a valid outcome and that its conditions must all hold.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioTrialReadsFeedback } from "../index.ts";

const graph = { nodes: [{ id: "s6", definitionId: "web.output.dom-extract_list", label: "read the requests" }] } as unknown as AutomationStudioFlowArtifact;
const listing = (kept: number, extra: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount => ({
  nodeId: "s6", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, itemsSeen: 8, kept,
  conditions: [
    { condition: "mutualFriends matches a bare count of five or more", rejected: 4, alone: 1, leftOutOnlyByThis: ["Private Person — mutualFriends: page words"] },
    { condition: "mutualFriends matches a named friend and others", rejected: 7, alone: 4 }
  ],
  ...extra
});

describe("a trial's list reads, for the model", () => {
  it("says a read that kept no rows saw rows, that its conditions must all hold, and what each rejected", () => {
    const [read] = automationStudioTrialReadsFeedback([listing(0)], graph);
    expect(read).toMatchObject({ nodeId: "s6", label: "read the requests", seen: 8, kept: 0, conditions: [
      { condition: "mutualFriends matches a bare count of five or more", rejected: 4, rejectedByItself: 1 },
      { condition: "mutualFriends matches a named friend and others", rejected: 7, rejectedByItself: 4 }
    ] });
    const said = read!.said as string;
    expect(said).toContain("The read saw 8 rows and kept none.");
    expect(said).toContain("A row is kept only when it passes every one of its 2 conditions");
    expect(said).toContain("Keeping no rows is a valid outcome");
    expect(said).toContain("not a fault in the Flow's connections");
    expect(said).toContain("must be one condition that names the forms together");
    expect(JSON.stringify(read)).not.toContain("page words");
  });

  it("says only the counts for a read that kept rows", () => {
    const [read] = automationStudioTrialReadsFeedback([listing(4)], graph);
    expect(read!.said).toBe("The read saw 8 rows and kept 4. A row is kept only when it passes every one of its 2 conditions (a row can fail more than one): mutualFriends matches a bare count of five or more rejected 4; mutualFriends matches a named friend and others rejected 7.");
  });

  it("says a read with no conditions by its counts alone, and nothing for a trial with no reads", () => {
    expect(automationStudioTrialReadsFeedback([{ nodeId: "s6", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, kept: 0 }], undefined)).toEqual([{ nodeId: "s6", kept: 0, said: "The read kept none." }]);
    expect(automationStudioTrialReadsFeedback(undefined, graph)).toEqual([]);
  });

  it("is in a judged trial's feedback beside what was stored", () => {
    const summary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false, reads: [listing(0)] } as AutomationStudioRunResultSummary;
    const verdict = { verdict: "no", expected: "four requests confirmed", observed: "none confirmed", advice: "fix the conditions", findings: [], spent: {} } as unknown as AutomationStudioBuildTestVerdict;
    const { feedback } = automationStudioCandidateTrialFeedback.judged({ verdict, summary, trialRunId: "trial.1", graph, start: "reset" });
    expect((feedback.reads as JsonObject[])[0]).toMatchObject({ nodeId: "s6", seen: 8, kept: 0 });
    expect(feedback.stored).toEqual({ rows: 0, refused: 0, missingRequired: 0 });
  });
});

// t474, lane D round 9 (`run-mv5q4j2n-25784472`, revs 5 to 15): seven trials whose listing kept no rows were failed
// before a judge was asked, each told only to check the Flow's connections and given no reads. A failed run now says
// what its reads kept, and its graph ending blames no wiring a loop that ran no passes explains.
describe("an execution-failed trial's reads and graph ending", () => {
  const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
  /** list -> head -> each; body: accept -> check -> head, each pass's row handed to both; done -> after -> members. */
  const loopGraph = {
    nodes: [
      { id: "s6", definitionId: "web.output.dom-extract_list", label: "read the requests" },
      { id: "head", definitionId: "builtin.control.merge" },
      { id: "each", definitionId: "builtin.control.for-each" },
      { id: "accept", definitionId: "web.output.dom-click", label: "accept the invitation" },
      { id: "check", definitionId: "web.output.dom-wait_for_text", label: "check it was accepted" },
      { id: "after", definitionId: "builtin.control.merge" },
      { id: "members", definitionId: "web.output.dom-extract_list", label: "read the members" }
    ],
    edges: [
      edge("s6", "success", "head", "branches"), edge("s6", "records", "each", "items"), edge("head", "success", "each"),
      edge("each", "body", "accept"), edge("each", "item", "accept", "item"), edge("each", "item", "check", "item"),
      edge("accept", "success", "check"), edge("check", "success", "head", "branches"),
      edge("each", "done", "after"), edge("after", "success", "members")
    ]
  } as unknown as AutomationStudioFlowArtifact;
  const ran = (...ids: string[]): AutomationStudioGraphExecutionTrace => ({
    status: "failed", startedAt: 1, values: {}, effects: [],
    failure: { category: "graph_validation_or_unknown_node", code: "executor.graph.unvisited_nodes", retryable: false, stage: "execution" },
    attempts: ids.map((id, index) => {
      const node = (loopGraph.nodes as Array<{ id: string; definitionId: string }>).find((candidate) => candidate.id === id)!;
      return { attemptId: `a${index}`, nodeId: id, definitionId: node.definitionId, startedAt: index, status: "succeeded" as const, ...(id === "each" ? { route: "done" } : {}), inputs: {}, outputs: {}, effects: [] };
    })
  });
  const failed = (trace: AutomationStudioGraphExecutionTrace, reads?: AutomationStudioResultReadAccount[]) =>
    automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.trial_failed", start: "not_reset", graph: loopGraph, trace, ...(reads ? { reads } : {}) }).feedback;

  it("carries the read account a judged trial carries, with the kept-none sentence", () => {
    const feedback = failed(ran("s6", "head", "each", "after", "members"), [listing(0)]);
    expect((feedback.reads as JsonObject[])[0]).toMatchObject({ nodeId: "s6", label: "read the requests", seen: 8, kept: 0 });
    expect(String((feedback.reads as JsonObject[])[0]!.said)).toContain("Keeping no rows is a valid outcome");
    expect(automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.trial_failed", start: "not_reset", graph: loopGraph, trace: ran("s6") }).feedback.reads).toBeUndefined();
  });

  it("does not ask for the connections to change when every step never reached is inside a loop that ran no passes", () => {
    const ending = failed(ran("s6", "head", "each", "after", "members"), [listing(0)]).graphEnding as JsonObject;
    expect(ending.code).toBe("executor.graph.unvisited_nodes");
    expect(String(ending.happened)).toContain("inside a loop that ran no passes");
    expect(String(ending.instruction)).toContain("not a fault in the Flow's connections");
    expect(String(ending.instruction)).not.toContain("Check the Flow's connections");
  });

  it("says a loop with no passes is not what was owed when another step was not reached", () => {
    const ending = failed(ran("s6", "head", "each", "after"), [listing(0)]).graphEnding as JsonObject;
    expect(String(ending.happened)).toContain("the steps inside it are not the ones the run still owed");
    expect(String(ending.instruction)).toContain("steps outside that loop");
  });

  it("keeps the wiring advice when no loop ran without passes", () => {
    const ending = failed(ran("s6"), [listing(3)]).graphEnding as JsonObject;
    expect(String(ending.instruction)).toContain("Check the Flow's connections");
  });
});
