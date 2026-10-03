// Phase 2's judge for one build, as the service wires it.
//
// **The rule (coordinator, 2026-10-01, under the user's three-phase build and
// no-restrictions rules).** The instructed-act completion check no longer
// refuses a completion. A Flow the model says is ready goes to its test from
// the start (the loop's dry-run gate), and then to a judge that reads what that
// test actually did and read -- each step's target, outcome and observation --
// against the instruction (`../../result-verification/build-test/`). Its
// verdict decides (`../../flow-bootstrap/unfinished-build/phases.ts`).
//
// **A verdict says which Flow it judged (user, 2026-10-02).** A build cannot
// finish until a whole-Flow run from its start was judged success on the Flow
// as it finally stands. So every verdict carries `flowSignature`: the Flow
// signature of the test it judged -- this round's observed test, never an
// earlier round's -- and none when no test was observed this round. Only a yes
// whose signature is the finished Flow's proposes the Flow; anything else,
// an unsure verdict or one not judged included, is repaired. There is no
// "finished unverified" any more, so nothing here says one.
//
// **What the judge is told beside the test (t195-w28a).** What the completion
// check's capability questions found of the accepted Flow -- no step producing
// the records asked for, or none going to where it starts -- used to refuse the
// completion. It is information now: the accepted verdict's `notes`, read here
// through `notes()` and put in the test's account, so the judge confirms them
// against the steps and a repair hears them through its reasons. The domain's
// view keys (`observedStateKeys`) are taken out of every observation, as the
// evidence loop takes them out of every view but the newest.
//
// **And the page the test ended on (t174-w89).** The test looks at the page
// once, right after its replay passes (`endView` on the test's report), and
// the judge is shown that look beside the steps. Run `run-murwd8le-79e735a8`'s
// judges (0046, 0047) read outcome words alone, while the page said `Cart (3)`
// and "Collected" (t174-w87 Cause 7). A test that took no look is judged
// without one, as before.
//
// **Why it is its own module.** The service holds the build's state (the
// round's last test, the accepted plan) in closures; this keeps that wiring in
// one place the tests can read, and keeps `../../service.ts` from growing.

import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioFlowBootstrapBuildPhasesInput, AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftDryRunGateInput, AutomationStudioFlowDraftTestReport, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioBuildTestJudge, automationStudioBuildTestResultSummary, type AutomationStudioBuildTestNote } from "../../result-verification/index.ts";
import { automationStudioEndViewLook, type AutomationStudioEndViewLook } from "../end-view/index.ts";

type BuildJudge = NonNullable<AutomationStudioFlowBootstrapBuildPhasesInput["judge"]>;

/** One build's judge: the round's own test is kept as it passes, and read when the round's Flow is judged. */
export type AutomationStudioFlowBootstrapBuildJudge = {
  /** Called as each round starts, so a judge never reads an earlier round's test. */
  roundStarted(): void;
  /** The loop's `observeTest`: the test the round's Flow last passed. */
  observeTest(report: AutomationStudioFlowDraftTestReport): void;
  /**
   * The loop's `testEndView`: one look at the page a passing test ended on,
   * through the build's executor, which the test puts on its report for this
   * judge (`../end-view/look.ts`). Absent where the domain offers no free look.
   */
  testEndView: AutomationStudioFlowDraftDryRunGateInput["endView"];
  /** The phases' `judge`: each verdict stamped with the Flow signature of the test it judged, where this round observed one. */
  judge: BuildJudge;
  /**
   * The provider calls every judgement of this build made. They are calls made
   * outside the loop, so a build counts them where it counts the authority's
   * (`additionalProviderCallCount`, `totalProviderCallCount`;
   * `./evidence-trace.ts`), never in `providerCallCount`, which is the loop's
   * decisions only. The accounting has their spend.
   */
  calls(): number;
};

export function automationStudioFlowBootstrapBuildJudge(input: {
  provider: AutomationStudioLlmProvider;
  /** The Flow's own instructions, as its runs are judged against them. */
  instructions: readonly AutomationStudioFlowInstruction[];
  deniedEvidenceKeys?: readonly string[] | undefined;
  projectId: string;
  flowId: string;
  signal?: AbortSignal | undefined;
  instructionText: string;
  startLocation?: string | undefined;
  /** The plan the completion check accepted last, whose nodes are the Flow's shape. */
  plan(): AutomationStudioFlowBootstrapPlan | undefined;
  /** What the completion check found the plan it accepted last cannot do; information for the judge. */
  notes?: (() => readonly AutomationStudioBuildTestNote[] | undefined) | undefined;
  /** The domain's declared view keys, as the evidence loop is given them. */
  observedStateKeys?: readonly string[] | undefined;
  /** The build's tools, whose free look takes the page a test ended on, and the executor it is sent through. */
  look?: { tools: Parameters<typeof automationStudioEndViewLook>[0]["tools"]; executeTool: Parameters<AutomationStudioEndViewLook>[0]["executeTool"] } | undefined;
}): AutomationStudioFlowBootstrapBuildJudge {
  let lastTest: AutomationStudioFlowDraftTestReport | undefined;
  let calls = 0;
  const counted = <Verdict extends { spent: { calls: number } }>(verdict: Verdict): Verdict => {
    calls += verdict.spent.calls;
    return verdict;
  };
  const ask = automationStudioBuildTestJudge({
    provider: input.provider, instructions: input.instructions, deniedEvidenceKeys: input.deniedEvidenceKeys,
    projectId: input.projectId, flowId: input.flowId, signal: input.signal
  });
  const look = input.look && automationStudioEndViewLook({ tools: input.look.tools, viewKeys: input.observedStateKeys });
  const executeTool = input.look?.executeTool;
  return {
    roundStarted: () => { lastTest = undefined; },
    observeTest: (report) => { lastTest = report; },
    testEndView: look && executeTool ? (request) => look({ ...request, executeTool }) : undefined,
    judge: async ({ loop, budget }) => {
      // The test this verdict is about, read once: the round's own, never an earlier round's.
      const judgedTest = lastTest;
      const verdict = counted(await ask({
        summary: automationStudioBuildTestResultSummary({
          steps: loop.steps, report: judgedTest, nodes: planNodes(input.plan()), instructionText: input.instructionText,
          result: loop.result, startLocation: input.startLocation, deniedEvidenceKeys: input.deniedEvidenceKeys,
          observedStateKeys: input.observedStateKeys, notes: input.notes?.(),
          // The page the test ended on, looked at as its replay passed (`../../llm/node-tools/dry-run-gate.ts`).
          ...(judgedTest?.endView ? { endView: judgedTest.endView } : {})
        }),
        budget
      }));
      return judgedTest ? { ...verdict, flowSignature: judgedTest.signature } : verdict;
    },
    calls: () => calls
  };
}

/** The accepted plan's nodes as Flow nodes: the shape of the Flow the judge is shown. */
function planNodes(plan: AutomationStudioFlowBootstrapPlan | undefined): AutomationStudioFlowNode[] {
  return (plan?.subflows ?? []).flatMap((subflow) => subflow.nodes.map((node) => ({
    id: node.key, definitionId: node.definitionId, definitionVersion: node.definitionVersion,
    ...(node.parameters ? { parameterValues: node.parameters } : {})
  })));
}
