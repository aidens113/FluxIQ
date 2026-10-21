// A single-subflow plan's candidate rebuilt from a submitted script (trace
// plan P5, `../rebuild.ts`): the brief's scope from the stored build record,
// the scoped submission of the script, and the single-subflow assembly a
// builder's test runs (`../proposal-assembly.ts`) through a fresh whole
// controller. Run beside a real single-subflow build on the supervisor
// fixture (a lending library's catalogue no realistic Lab scenario uses), the
// rebuild reproduces the proposal digest the builder's submission made and
// the whole candidate digest its test judged; a refused script, and a plan of
// several subflows, come back as a refusal with its stage and codes.
import { describe, expect, it } from "vitest";
import { refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { BUILD, TASK, planInput, project, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioProjectSingleSubflowRebuild } from "../index.ts";
import { script, singleBuild } from "./single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PARTS = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const completeOnDispatch: Step = (evidence) => ({ kind: "complete", result: lastOf(evidence, IDS.dispatch)!.complete as JsonObject });

/** The builder's surroundings as the fixture's builders and supervisor submit with them. */
const surroundings = () => ({ submission: refusalTestSubmission(), instructionText: TASK });

describe("a single-subflow candidate rebuilt from a submitted script", () => {
  it("reproduces the proposal and whole candidate digests the builder's single-subflow test produced", async () => {
    const built = singleBuild();
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    const answer = built.answers[0]!;
    if (!("trial" in answer)) throw new Error(`expected a trial, got ${JSON.stringify(answer)}`);
    const view = await run.record.read(BUILD);

    const rebuilt = await automationStudioProjectSingleSubflowRebuild({ record: view!.record, briefId: "brief-1", script: script("find_newest").join("\n"), ...surroundings() });

    if (!rebuilt.ok) throw new Error(`expected a rebuild, got ${JSON.stringify(rebuilt)}`);
    expect(rebuilt.proposal).toEqual({ revision: answer.trial.revision, digest: answer.trial.digest });
    expect(rebuilt.candidate.digest).toBe(run.trials[0]!.digest);
    expect(rebuilt.candidate.buildPlan.plan.subflows.map((entry) => entry.key)).toEqual(["find_newest"]);
  });

  it("answers a script the scoped submission refuses with the subflow stage and its codes", async () => {
    const built = singleBuild();
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    const view = await run.record.read(BUILD);

    const rebuilt = await automationStudioProjectSingleSubflowRebuild({ record: view!.record, briefId: "brief-1", script: "flow: nothing here", ...surroundings() });

    expect(rebuilt.ok).toBe(false);
    if (rebuilt.ok) return;
    expect(rebuilt.stage).toBe("subflow");
    expect(rebuilt.codes.length).toBeGreaterThan(0);
    expect(rebuilt.proposal).toBeUndefined();
  });

  it("refuses a brief of a plan of several subflows, which no single-subflow test runs", async () => {
    const run = await supervise([call(IDS.writePlan, TWO_PARTS), dispatch([brief("find_titles", ["p1"])]), end("blocked")], project());
    const view = await run.record.read(BUILD);

    const rebuilt = await automationStudioProjectSingleSubflowRebuild({ record: view!.record, briefId: "brief-1", script: script("find_titles").join("\n"), ...surroundings() });

    expect(rebuilt).toEqual({ ok: false, stage: "plan", codes: ["project.whole_trial_not_this_plan"] });
  });

  it("refuses a brief id the record does not hold", async () => {
    const built = singleBuild();
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    const view = await run.record.read(BUILD);

    await expect(automationStudioProjectSingleSubflowRebuild({ record: view!.record, briefId: "brief-9", script: script("find_newest").join("\n"), ...surroundings() })).rejects.toThrow("project.brief_unknown");
  });
});
