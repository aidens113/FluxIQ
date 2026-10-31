// The supervisor's whole-Flow controller is given the task part that owes records (K5).
//
// The controller is made before the supervisor writes its task spec, so it is handed a resolver that reads the
// spec at each step. The controller is spied on to see it: after a plan whose one part owes records the resolver
// answers with that part's columns; after a plan whose part owes none, or with no plan, it answers nothing, which is
// what a step got before the input existed.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AuthoringPartOfStep } from "../../../../../flow-bootstrap/record-defaults/index.ts";

const made: Array<{ partOf?: AuthoringPartOfStep | undefined }> = [];
vi.mock("../../../../../flow-bootstrap/candidate/index.ts", async (original) => {
  const actual = await original<typeof import("../../../../../flow-bootstrap/candidate/index.ts")>();
  class Spied extends actual.AutomationStudioFlowCandidateSubmissionController {
    constructor(input: ConstructorParameters<typeof actual.AutomationStudioFlowCandidateSubmissionController>[0]) {
      made.push(input);
      super(input);
    }
  }
  return { ...actual, AutomationStudioFlowCandidateSubmissionController: Spied };
});

const { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS: IDS } = await import("../../../index.ts");
const { planInput, subflow } = await import("../../supervisor-fixture.ts");
const { FIND, call, end, supervise } = await import("../../supervisor-script.ts");

const spec = (answer: JsonObject | undefined): JsonObject => ({
  parts: [{ id: "p1", quote: { sourceId: "instruction.1", text: FIND }, goalFacts: [`${FIND} is done`], lastingActs: [], ...(answer ? { answer } : {}) }],
  notAsked: ["borrowing any title"]
});

async function resolverAfter(answer: JsonObject | undefined) {
  made.length = 0;
  await supervise([call(IDS.writePlan, planInput([subflow("find_newest", ["p1"])], spec(answer))), end("blocked")]);
  return made[0]!.partOf;
}

describe("the supervisor's whole-Flow controller", () => {
  it("resolves the task part that owes records once the plan is written", async () => {
    const partOf = await resolverAfter({ kind: "records", columns: ["title", "year"] });
    expect(partOf?.("any step")?.columns).toEqual(["title", "year"]);
  });

  it("resolves nothing when the plan's part owes no records", async () => {
    const partOf = await resolverAfter(undefined);
    expect(partOf?.("any step")).toBeUndefined();
  });

  it("resolves nothing before any plan is written", async () => {
    made.length = 0;
    await supervise([end("blocked")]);
    expect(made[0]!.partOf?.("any step")).toBeUndefined();
  });
});
