// An amendment never drops the person's request (A8 frozen pair 3 bigbox,
// t645). `run-mv9zn5ob-d929084d` amended its plan so that no part quoted the
// person's first request and `notAsked` listed it; Core accepted it and the
// build could only end on a false reason. Here, on a lending library's
// catalogue, an amendment that drops a part's words, or moves them under
// notAsked, is refused `project.plan_part_dropped` naming the part and the
// words, while a re-split of the same words or a change of facts stands.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioProjectTaskSpec } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { automationStudioProjectSupervisorPlanInput } from "../plan-input.ts";
import { SOURCES, planInput, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, call, end, supervise } from "./supervisor-script.ts";

const TWO = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const part = (id: string, text: string, facts: string[] = [`${text} is done`], lastingActs: string[] = []): JsonObject => ({ id, quote: { sourceId: "instruction.1", text }, goalFacts: facts, lastingActs });
const DROPPED = "project.plan_part_dropped";

/** The task spec of the plan in force: TWO as written. */
function inForce(): AutomationStudioProjectTaskSpec {
  const written = automationStudioProjectSupervisorPlanInput(TWO, SOURCES);
  if (!written.ok) throw new Error(JSON.stringify(written.issues));
  return written.taskSpec;
}

const amend = (value: JsonObject) => automationStudioProjectSupervisorPlanInput(value, SOURCES, inForce());

describe("an amendment against the plan in force", () => {
  it("refuses a plan that leaves a part's words out and lists them under notAsked, naming the part and the words", () => {
    const onlyHold = planInput([subflow("place_hold", ["p2"])], { parts: [part("p2", HOLD, [`${HOLD} is done`], ["modify_existing"])], notAsked: ["borrowing any title", FIND] });
    expect(amend(onlyHold)).toEqual({ ok: false, issues: [
      { code: DROPPED, path: "taskSpec.parts", part: "p1", dropped: FIND },
      { code: DROPPED, path: "taskSpec.notAsked.1", part: "p1", dropped: FIND }
    ] });
    // In other words under notAsked, the parts still lost them.
    const reworded = planInput([subflow("place_hold", ["p2"])], { parts: [part("p2", HOLD)], notAsked: ["find the newest titles by that author"] });
    expect(amend(reworded)).toEqual({ ok: false, issues: [{ code: DROPPED, path: "taskSpec.parts", part: "p1", dropped: FIND }] });
    // Written first, nothing is in force, so nothing is measured against it.
    expect(automationStudioProjectSupervisorPlanInput(onlyHold, SOURCES).ok).toBe(true);
  });

  it("refuses a notAsked item the amendment adds that holds a part's words or is held in them, even with every part kept", () => {
    const kept = (notAsked: string[]) => planInput(TWO.subflows as JsonObject[], { parts: [part("p1", FIND), part("p2", HOLD, undefined, ["create_new"])], notAsked });
    expect(amend(kept(["borrowing any title", `${HOLD.toUpperCase()} twice`]))).toEqual({ ok: false, issues: [{ code: DROPPED, path: "taskSpec.notAsked.1", part: "p2", dropped: HOLD }] });
    expect(amend(kept(["borrowing any title", "newest titles by Ada"]))).toEqual({ ok: false, issues: [{ code: DROPPED, path: "taskSpec.notAsked.1", part: "p1", dropped: FIND }] });
    // An item the plan in force already listed is not the amendment's to answer for; one naming other words stands.
    expect(amend(kept(["borrowing any title", "renewing a loan"])).ok).toBe(true);
  });

  it("accepts the same words split into other parts, or joined into one", () => {
    const split = planInput([
      subflow("find_titles", ["p1a", "p1b"], { outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
    ], { parts: [part("p1a", "Find the three newest titles"), part("p1b", "by Ada Hart"), part("p2", HOLD, undefined, ["create_new"])], notAsked: ["borrowing any title"] });
    const result = amend(split);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const joined = planInput([subflow("find_and_hold", ["p1"])], { parts: [part("p1", `${FIND} and ${HOLD}`, undefined, ["create_new"])], notAsked: ["borrowing any title"] });
    expect(amend(joined).ok).toBe(true);
  });

  it("accepts a change of facts alone, and words moved by a word or two at an end; refuses a longer stretch cut", () => {
    const facts = planInput(TWO.subflows as JsonObject[], { parts: [part("p1", FIND, ["three titles are read from the catalogue"]), part("p2", HOLD, undefined, ["create_new"])], notAsked: ["borrowing any title"] });
    expect(amend(facts).ok).toBe(true);
    const edge = planInput(TWO.subflows as JsonObject[], { parts: [part("p1", "the three newest titles by Ada Hart"), part("p2", HOLD, undefined, ["create_new"])], notAsked: ["borrowing any title"] });
    expect(amend(edge).ok).toBe(true);
    const cut = planInput(TWO.subflows as JsonObject[], { parts: [part("p1", "newest titles by Ada Hart"), part("p2", HOLD, undefined, ["create_new"])], notAsked: ["borrowing any title"] });
    expect(amend(cut)).toEqual({ ok: false, issues: [{ code: DROPPED, path: "taskSpec.parts", part: "p1", dropped: "Find the three" }] });
  });

  it("answers project.amend_plan with the code, the part, the words and why, and keeps the plan in force", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO),
      call(IDS.amendPlan, { ...planInput([subflow("place_hold", ["p2"])], { parts: [part("p2", HOLD)], notAsked: ["borrowing any title", FIND] }), reason: "The first part cannot be done." }),
      end("blocked")
    ]);
    const answered = run.shown.filter((entry) => entry.toolId === IDS.amendPlan).map((entry) => entry.value as JsonObject)[0]!;
    expect(answered).toMatchObject({ ok: false, code: "project.plan_refused" });
    expect(answered.issues).toEqual([
      { code: DROPPED, path: "taskSpec.parts", part: "p1", dropped: FIND, why: GUIDANCE.planIssues[DROPPED] },
      { code: DROPPED, path: "taskSpec.notAsked.1", part: "p1", dropped: FIND, why: GUIDANCE.planIssues[DROPPED] }
    ]);
    expect(GUIDANCE.planIssues[DROPPED]).toContain("end honestly with ended (partial or blocked)");
  });
});
