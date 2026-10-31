// The rebuild's whole controller is given the plan part its scope serves (K5).
//
// The scoped submission already reads the part; the whole candidate's controller is made beside it, and without
// the part its record outputs would be defaulted differently from the proposal's. The controller is spied on to see
// what it was made with: a scope with one part that owes records hands it the part's answer, and a scope with none
// hands it no resolver, as before.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AuthoringPartOfStep } from "../../../flow-bootstrap/record-defaults/index.ts";

const made: Array<{ partOf?: AuthoringPartOfStep | undefined }> = [];
vi.mock("../../../flow-bootstrap/candidate/index.ts", async (original) => {
  const actual = await original<typeof import("../../../flow-bootstrap/candidate/index.ts")>();
  class Spied extends actual.AutomationStudioFlowCandidateSubmissionController {
    constructor(input: ConstructorParameters<typeof actual.AutomationStudioFlowCandidateSubmissionController>[0]) {
      made.push(input);
      super(input);
    }
  }
  return { ...actual, AutomationStudioFlowCandidateSubmissionController: Spied };
});

const { refusalTestSubmission } = await import("../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts");
const { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS: IDS } = await import("../../supervisor/index.ts");
const { BUILD, TASK, planInput, subflow } = await import("../../supervisor/tests/supervisor-fixture.ts");
const { FIND, brief, call, dispatch, lastOf, supervise } = await import("../../supervisor/tests/supervisor-script.ts");
const { automationStudioProjectSingleSubflowRebuild } = await import("../index.ts");
const { script, singleBuild } = await import("./single-build.ts");

const spec = (answer: JsonObject | undefined): JsonObject => ({
  parts: [{ id: "p1", quote: { sourceId: "instruction.1", text: FIND }, goalFacts: [`${FIND} is done`], lastingActs: [], ...(answer ? { answer } : {}) }],
  notAsked: ["borrowing any title"]
});
const completeOnDispatch = (evidence: Parameters<ReturnType<typeof call>>[0]): JsonObject => ({ kind: "complete", result: lastOf(evidence, IDS.dispatch)!.complete as JsonObject });

async function wholeControllerInput(answer: JsonObject | undefined) {
  const built = singleBuild();
  const run = await supervise([call(IDS.writePlan, planInput([subflow("find_newest", ["p1"])], spec(answer))), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
  const view = await run.record.read(BUILD);
  made.length = 0;
  const rebuilt = await automationStudioProjectSingleSubflowRebuild({ record: view!.record, briefId: "brief-1", script: script("find_newest").join("\n"), submission: refusalTestSubmission(), instructionText: TASK });
  expect(rebuilt.ok, JSON.stringify(rebuilt)).toBe(true);
  return made.at(-1)!;
}

describe("a rebuild's whole controller", () => {
  it("is given the part that owes records", async () => {
    const input = await wholeControllerInput({ kind: "records", columns: ["title", "year"] });
    expect(input.partOf?.("any step")?.columns).toEqual(["title", "year"]);
  });

  it("is given no resolver when the scope's part owes no records", async () => {
    const input = await wholeControllerInput(undefined);
    expect(input.partOf).toBeUndefined();
  });
});
