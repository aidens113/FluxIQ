// Phase 2's judge for one build, as the service wires it.
//
// **The rule (coordinator, 2026-10-01, under the user's three-phase build and
// no-restrictions rules).** The instructed-act completion check no longer
// refuses a completion. A Flow the model says is ready goes to its test from
// the start (the loop's dry-run gate), and then to a judge that reads what that
// test actually did and read -- each step's target, outcome and observation --
// against the instruction (`../../result-verification/build-test/`). Its
// verdict decides (`../../flow-bootstrap/unfinished-build/phases.ts`): yes
// proposes the Flow, no repairs it with the judge's reasons, and a judge that
// could not settle it proposes the Flow said to be unverified -- except a
// re-authored Flow whose carried steps were never run in this build.
//
// **Why it is its own module.** The service holds the build's state (the
// round's last test, the accepted plan) in closures; this keeps that wiring in
// one place the tests can read, and keeps `../../service.ts` from growing.

import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioFlowBootstrapBuildPhasesInput, AutomationStudioFlowBootstrapBuildPhasesOutcome, AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftTestReport, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioBuildTestJudge, automationStudioBuildTestResultSummary } from "../../result-verification/index.ts";

type BuildJudge = NonNullable<AutomationStudioFlowBootstrapBuildPhasesInput["judge"]>;
type Announce = NonNullable<AutomationStudioFlowBootstrapBuildPhasesInput["announce"]>;

/** One build's judge: the round's own test is kept as it passes, and read when the round's Flow is judged. */
export type AutomationStudioFlowBootstrapBuildJudge = {
  /** Called as each round starts, so a judge never reads an earlier round's test. */
  roundStarted(): void;
  /** The loop's `observeTest`: the test the round's Flow last passed. */
  observeTest(report: AutomationStudioFlowDraftTestReport): void;
  /** The phases' `judge`. */
  judge: BuildJudge;
  /** Says so in the chat when the build ends with a Flow no judge said yes to. */
  unverified(built: AutomationStudioFlowBootstrapBuildPhasesOutcome, announce: Announce): void;
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
}): AutomationStudioFlowBootstrapBuildJudge {
  let lastTest: AutomationStudioFlowDraftTestReport | undefined;
  const ask = automationStudioBuildTestJudge({
    provider: input.provider, instructions: input.instructions, deniedEvidenceKeys: input.deniedEvidenceKeys,
    projectId: input.projectId, flowId: input.flowId, signal: input.signal
  });
  return {
    roundStarted: () => { lastTest = undefined; },
    observeTest: (report) => { lastTest = report; },
    judge: async ({ loop, budget }) => await ask({
      summary: automationStudioBuildTestResultSummary({
        steps: loop.steps, report: lastTest, nodes: planNodes(input.plan()), instructionText: input.instructionText,
        result: loop.result, startLocation: input.startLocation, deniedEvidenceKeys: input.deniedEvidenceKeys
      }),
      budget
    }),
    unverified: (built, announce) => {
      if (built.kind !== "finished" || (built.judged?.verdict !== "unknown" && built.judged?.verdict !== "not_judged")) return;
      announce({ phase: "verifying", label: "Flow not verified", text: `Its test was not judged to answer what you asked: ${built.judged.why} Its first run is judged again.` });
    }
  };
}

/** The accepted plan's nodes as Flow nodes: the shape of the Flow the judge is shown. */
function planNodes(plan: AutomationStudioFlowBootstrapPlan | undefined): AutomationStudioFlowNode[] {
  return (plan?.subflows ?? []).flatMap((subflow) => subflow.nodes.map((node) => ({
    id: node.key, definitionId: node.definitionId, definitionVersion: node.definitionVersion,
    ...(node.parameters ? { parameterValues: node.parameters } : {})
  })));
}
