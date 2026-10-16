// A plan holding a subflow that only reshapes what another reads is refused
// once (A8 towels `run-mvac0nmw`, t658). t630 warned on such a subflow; the
// towels run was warned at its first plan, dispatched the subflow anyway, and
// lost most of its money to the split, as A8 wave 7 had. A warning the model
// can pass over does not hold, so the plan is now refused with the warning's
// words and t650's resend mark, and the same plan sent again is written: only
// the model can tell that its builder must open something for each row. A
// lending library's catalogue, as the supervisor's other tests use.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, NOTE, call, end, supervise } from "./supervisor-script.ts";

const SPEC = taskSpecInput([["p1", FIND, []], ["p2", NOTE, []]]);
/** A second subflow that only orders and chooses columns of the rows the first reads. */
const SPLIT = planInput([
  subflow("find_titles", ["p1"], { outputs: ["titles"] }),
  subflow("shape_list", ["p2"], { inputs: ["titles"], outputs: ["list"], after: ["find_titles"] })
], SPEC);
/** The same shaping carried by the subflow that reads. */
const FOLDED = planInput([subflow("find_titles", ["p1", "p2"], { outputs: ["list"] })], SPEC);

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("a plan holding a subflow that only reshapes what another reads", () => {
  it("is refused once, with the warning's words and the resend mark; the identical plan sent again is written, the warning beside it", async () => {
    const run = await supervise([call(IDS.writePlan, SPLIT), call(IDS.writePlan, SPLIT), end("blocked")]);
    const [refused, written] = answersOf(run.shown, IDS.writePlan);
    expect(refused).toMatchObject({
      ok: false, code: "project.plan_refused", instruction: GUIDANCE.refusals.reshapeOnlyOnce,
      issues: [{ code: "project.plan_subflow_reshape_only", path: "subflows.1", why: GUIDANCE.planIssues["project.plan_subflow_reshape_only"] }],
      diagnostics: { resend: "accepted_once" }
    });
    expect(written).toMatchObject({ ok: true, written: "plan" });
    expect((written!.warnings as JsonObject[]).map((warning) => warning.code)).toContain("project.plan_subflow_reshape_only");
    // Only the plan sent again was recorded.
    expect(run.view!.record.plans).toHaveLength(1);
    expect(run.view!.record.plans[0]!.plan.plan.subflows.map((entry) => entry.key)).toEqual(expect.arrayContaining(["find_titles", "shape_list"]));
  });

  it("is written the first time when the reading subflow carries the shaping", async () => {
    const run = await supervise([call(IDS.writePlan, FOLDED), end("blocked")]);
    const [written] = answersOf(run.shown, IDS.writePlan);
    expect(written).toMatchObject({ ok: true, written: "plan" });
    expect(written).not.toHaveProperty("warnings");
  });

  it("refuses an amendment that splits the shaping out once, and takes it sent again", async () => {
    const amend = { ...SPLIT, reason: "Shape the list on its own." };
    const run = await supervise([call(IDS.writePlan, FOLDED), call(IDS.amendPlan, amend), call(IDS.amendPlan, amend), end("blocked")]);
    const [refused, written] = answersOf(run.shown, IDS.amendPlan);
    expect(refused).toMatchObject({ ok: false, code: "project.plan_refused", issues: [{ code: "project.plan_subflow_reshape_only", path: "subflows.1" }], diagnostics: { resend: "accepted_once" } });
    expect(written).toMatchObject({ ok: true, written: "plan_revision" });
    expect(run.view!.record.plans).toHaveLength(2);
  });

  it("names nothing of a realistic scenario in the refusal's words", () => {
    const words = GUIDANCE.refusals.reshapeOnlyOnce;
    expect(words.match(/store|shop|marketplace|retail|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu)?.[0]).toBeUndefined();
    expect(words.match(/towel|pickup|cart\b|basket|bid\b|watchlist|coupon|connection|job|quote|rating/iu)?.[0]).toBeUndefined();
  });
});
