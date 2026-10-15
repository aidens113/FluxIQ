// After a producer could not make a value (`../dispatch-tool.ts`, A8 frozen pair 3 bigbox, t645).
// `run-mv9zn5ob-d929084d` planned a value its first subflow could not make and
// its second only took by name; the supervisor read the block as "cannot do
// the first part". A return not done on an output its subflow could not make
// now has the dispatch's next step name both ends: the subflow that takes the
// value, the value, and the producer. On a lending library's catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, supervise } from "./supervisor-script.ts";

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
const SPEC = taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]);

describe("the next step after a producer could not make its value", () => {
  it("names the subflow that takes the value, the value and the producer, and what to change", async () => {
    const plan = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], SPEC);
    const built = project({ builder: (sent) => (sent.subflowKey === "find_titles" ? "blocked" : "done"), unmadeOutput: (sent) => (sent.subflowKey === "find_titles" ? "titles" : undefined) });
    const run = await supervise([call(IDS.writePlan, plan), dispatch([brief("find_titles", ["p1"])]), end("blocked")], built);
    const answered = answersOf(run.shown, IDS.dispatch)[0]!;
    expect(answered.returns).toMatchObject([{ subflowKey: "find_titles", outcome: "blocked", unmadeOutput: "titles" }]);
    const next = String(answered.next);
    expect(next.startsWith("\"place_hold\" takes \"titles\", which \"find_titles\" could not make")).toBe(true);
    expect(next).toContain("drop \"titles\" from \"find_titles\"'s outputs and from the inputs of \"place_hold\", and keep \"find_titles\" in their after");
    expect(next).not.toContain("{");
  });

  it("says when no other subflow takes it, and says nothing new for a return blocked on anything else", async () => {
    const plan = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { after: ["find_titles"] })], SPEC);
    const untaken = await supervise([call(IDS.writePlan, plan), dispatch([brief("find_titles", ["p1"])]), end("blocked")], project({ builder: () => "blocked", unmadeOutput: () => "titles" }));
    expect(answersOf(untaken.shown, IDS.dispatch)[0]!.next).toBe(GUIDANCE.next.afterOutputUnmadeUntaken.replaceAll("{producer}", "\"find_titles\"").replaceAll("{value}", "\"titles\""));
    const other = await supervise([call(IDS.writePlan, plan), dispatch([brief("find_titles", ["p1"])]), end("blocked")], project({ builder: () => "blocked" }));
    expect(answersOf(other.shown, IDS.dispatch)[0]!.next).toBe(GUIDANCE.next.afterReturnsNotDone);
  });
});
