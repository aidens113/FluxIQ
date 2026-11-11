// A saved step that answered what stood in front of the page, passed over on a replay because that
// layer was not there (t897, `../steps-ran.ts`). Live run `run-mwbadi79-d928f922`: the cookie banner
// social-network-feed shows once was answered by attempt 1's step s2. On every later attempt the
// site remembered the answer, the banner never came, and the engine passed s2 over as a press "not
// done", since the domain says every press commits. Each replay was then judged for `act_not_done`
// instead of standing on its record. The banner's absence is the accepted run's own page; a lasting
// act really left undone still sends the replay to the judge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../../../../../engine/automation/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstReplayStands } from "../../completion/index.ts";
import { savedStep } from "../../tests/fake-library-engine.ts";
import { automationStudioAnswerFirstFlowRunStepsRan } from "../steps-ran.ts";

const KEYS = ["s1", "s2", "s3"];
const plan = { plan: { subflows: [{ key: "primary", nodes: KEYS.map((key) => ({ key, definitionId: "library.step" })) }] } } as unknown as AutomationStudioFlowBuildPlan;
const locator: AutomationStudioFlowBootstrapIssueLocator = { paths: {}, nodes: Object.fromEntries(KEYS.map((_, index) => [`0.${index}`, { step: "library.step", draftStep: index + 1, draftStepId: `d${index + 1}` }])), edges: {}, subflows: {}, rules: {}, lines: [] };
const graph = { nodes: KEYS.map((key, index) => ({ id: `n${index + 1}`, definitionId: "library.step", metadata: { bootstrapSymbolicKey: key } })) };

function attempt(nodeId: string, skipped?: AutomationStudioNodeAttemptTrace["skipped"]): AutomationStudioNodeAttemptTrace {
  return { attemptId: `a.${nodeId}`, nodeId, definitionId: "library.step", startedAt: 1, finishedAt: 2, status: "succeeded", route: skipped ? "skipped" : "success", inputs: {}, outputs: {}, ...(skipped ? { skipped } : {}) } as AutomationStudioNodeAttemptTrace;
}

/** The run as the engine left it: the banner step passed over as an act not done, the rest ran. */
function ran(banner: Partial<AutomationStudioFlowDraftStep>) {
  const saved = [
    { ...savedStep(1, "domain.library.open_account"), id: "d1" },
    { ...savedStep(2, "domain.library.close_prompt", { control: "#accept-cookies" }), id: "d2", ...banner },
    { ...savedStep(3, "domain.library.read_loans"), id: "d3" }
  ] as AutomationStudioFlowDraftStep[];
  const trace = { attempts: [attempt("n1"), attempt("n2", { reason: "target_absent", code: "executor.state.absent", notDone: true }), attempt("n3")] };
  return automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan, locator, saved, ended: { reachedEnd: true, trace, graph } as unknown as Parameters<typeof automationStudioAnswerFirstFlowRunStepsRan>[0]["ended"] });
}

const SHAPE = { columns: ["title"], empty: false };
const stands = (steps: ReturnType<typeof ran>["steps"]) =>
  automationStudioAnswerFirstReplayStands({ saved: { label: "confirmed", provenWhole: true, shape: SHAPE }, reachedEnd: true, steps, repaired: false }, { shape: SHAPE });

describe("a saved step whose layer was not there on the replay", () => {
  it("is an interruption passed over as saved, and the replay stands on its record", () => {
    const outcome = ran({ interruption: true });
    expect(outcome.steps[1]).toMatchObject({ position: 2, ran: "skipped", skipped: "absent" });
    expect(outcome.steps[1]?.happened).toMatch(/was not there this time/u);
    expect(stands(outcome.steps)).toEqual({ stands: true });
  });

  it("is still an act not done where the step does one of the person's acts, and the replay is judged", () => {
    const outcome = ran({ interruption: true, acts: ["a1"] });
    expect(outcome.steps[1]).toMatchObject({ ran: "skipped", skipped: "absent_not_done" });
    expect(stands(outcome.steps)).toEqual({ stands: false, deviation: "act_not_done" });
  });

  it("is still an act not done where the saved step answered no layer", () => {
    const outcome = ran({});
    expect(outcome.steps[1]).toMatchObject({ ran: "skipped", skipped: "absent_not_done" });
    expect(stands(outcome.steps)).toEqual({ stands: false, deviation: "act_not_done" });
  });
});
