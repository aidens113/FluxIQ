import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialRequest } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
const offeredAlso = ["core.submit_candidate", "core.test_candidate", "core.run_flow", "project.dispatch"].map((toolId): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, effect: "observe", inputSchema: { type: "object" } }));

type Entry = { callId: string; toolId: string; value: unknown };
type Decide = Parameters<typeof runAutomationStudioSubflowBuilderLoop>[0]["loop"]["decide"];
const receiptOf = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};

async function build(steps: Array<(evidence: readonly Entry[]) => JsonObject>, options: { port?: boolean; callScope?: string; scope?: ReturnType<typeof testScope> } = {}) {
  const observed: AutomationStudioLlmEvidenceLoopInput[] = [];
  const executed: string[] = [];
  const offered: string[][] = [];
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  let index = 0;
  const decide: Decide = async ({ evidence, tools }) => {
    offered.push(tools.map((tool) => tool.toolId));
    const step = steps[index++];
    if (!step) throw new Error("script exhausted");
    return step(evidence);
  };
  const outcome = await runAutomationStudioSubflowBuilderLoop({
    scope: options.scope ?? testScope(), siblings: [...SIBLINGS], submission: testSubmission(),
    ...(options.callScope === undefined ? {} : { callScope: options.callScope }),
    observe: (loop) => {
      observed.push(loop);
      return loop;
    },
    ...(options.port === false ? {} : { trial: { port: async (request: AutomationStudioSubflowTrialRequest) => {
      asked.push(request);
      return { partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes" as const, feedback: {}, entryPrepared: true };
    } } }),
    loop: {
      tools: [look, ...offeredAlso], maxIterations: steps.length, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: async (call) => {
        executed.push(call.callId);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true };
      },
      decide
    }
  });
  return { outcome, executed, offered, asked, observed };
}

const submit = () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) });
const test = (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: receiptOf(evidence) });
const complete = (extra: JsonObject = {}) => (evidence: readonly Entry[]) => ({ kind: "complete", result: { subflowKey: "find_listing", ...receiptOf(evidence), ...extra } });

describe("a subflow builder's loop", () => {
  it("opens under its brief, offers only a builder's tools, submits, tries and completes with its subflow, revision and digest", async () => {
    const { outcome, executed, offered, asked, observed } = await build([submit, test, complete()], { callScope: "brief-1" });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(executed[0]).toBe("initial.core.run_node.brief-1");
    expect(offered[0]).toEqual(expect.arrayContaining(["core.run_node", AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID]));
    for (const dropped of ["core.submit_candidate", "core.test_candidate", "core.run_flow", "project.dispatch"]) expect(offered[0]).not.toContain(dropped);
    expect(asked).toHaveLength(1);
    expect(outcome.proposal?.subflows.map((subflow) => subflow.key)).toEqual(["find_listing", "find_listing-narrow"]);
    expect(outcome.trial).toMatchObject({ partial: true, verdict: "yes" });
    expect(outcome.promotionAllowed).toBe(false);
    // Its wrap-up keeps its own two finishing tools running, not the whole candidate's.
    expect(observed[0]!.finishingTools).toEqual({ submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID });
  });

  // The plan the project supervisor writes gives no success check, which makes proposing one the builder's (t569).
  it("tells the builder to propose a success check in `done when:` terms when the plan gives none, and that a plan's check is the plan's", async () => {
    const said = async (scope: ReturnType<typeof testScope>) => {
      const { observed } = await build([submit], { scope });
      return observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.description;
    };
    const routed = await said(testScope());
    expect(routed).toContain("The plan gives it no success check, so propose one with it: a `done when: <fact>` line outside every block, after its last step");
    expect(routed).toContain("It becomes this subflow's success check, and its trial is judged against it.");
    expect(routed).not.toContain("success check are the plan's");
    const part = await said(testScope({ interface: { inputs: [], outputs: [] } }));
    expect(part).toContain("inside its own `part find_listing:` block, before its first step");
    const check: NonNullable<ReturnType<typeof testScope>["successCheck"]> = [{ fact: "text", op: "contains", value: "Listings" }];
    const planned = await said(testScope({ successCheck: check }));
    expect(planned).toContain("Its success check is the plan's; leave out `done when:` for it or write exactly that.");
    expect(planned).not.toContain("propose one");
  });

  // A8 round 1: a builder wrote another subflow's part into its own, and another declared no `input:` line (t570).
  it("shows the builder its brief: its parts in the person's words and, for a callable subflow, the exact lines its part declares", async () => {
    const said = async (scope: ReturnType<typeof testScope>) => {
      const { observed } = await build([submit], { scope });
      return observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.description;
    };
    const routed = await said(testScope());
    expect(routed).toContain("Your brief is the subflow \"find_listing\" alone. It does only this part of the task: \"Find the listings on the listings page\".");
    expect(routed).toContain("write its steps outside every block");
    const callable = await said(testScope({ interface: { inputs: [{ id: "listingUrl", name: "Listing URL", valueType: { kind: "unknown" } }], outputs: [{ id: "price", name: "Price", valueType: { kind: "unknown" } }] } }));
    expect(callable).toContain("it is given exactly \"listingUrl\" and hands back exactly \"price\"");
    expect(callable).toContain("part find_listing: <what it does>\n  input: listingUrl\n  output: price = $step.<label>.<output>\n");
    expect(callable).not.toContain("JSON plan");
  });

  it("counts its allowance's calls in its budget, keeping its finishing trials' judges back", async () => {
    const { observed } = await build([submit]);
    expect(observed[0]!.budget).toEqual({ countCalls: { keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS } });
  });

  it("keeps the opening id exactly `initial.<toolId>` when the dispatcher passes no scope", async () => {
    const { outcome, executed, observed } = await build([submit, test, complete()]);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(executed[0]).toBe("initial.core.run_node");
    expect(observed[0]!.callScope).toBeUndefined();
  });

  it("refuses a completion before the trial, and one naming another subflow", async () => {
    const seen: JsonObject[] = [];
    const remember = (step: (evidence: readonly Entry[]) => JsonObject) => (evidence: readonly Entry[]) => {
      seen.push(...evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID).map((entry) => entry.value as JsonObject));
      return step(evidence);
    };
    const { outcome } = await build([submit, remember(complete()), remember(complete({ subflowKey: "checkout" })), remember(test), complete()]);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(JSON.stringify(seen)).toContain("subflow.trial_required");
    expect(JSON.stringify(seen)).toContain("subflow.latest_proposal_required");
  });
});
