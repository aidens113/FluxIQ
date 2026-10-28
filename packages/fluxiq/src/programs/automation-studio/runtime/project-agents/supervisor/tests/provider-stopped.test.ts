// A supervisor whose model provider stopped answering after a builder made a
// lasting act (t621, `../supervisor-loop.ts`). Core's reset brief is a
// builder run on that same provider, so it is not sent: the ending names the
// act still on the target, and its record reason says the provider stopped
// answering under the person's ending code, never "the supervisor stopped". A
// loop a guard stopped still resets first. Run on the build of
// `./supervisor-fixture.ts` with its real lasting-act ledger.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AutomationStudioLlmUnusableDecisionError } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, supervise, type Step } from "./supervisor-script.ts";

const TWO_PART = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
/** Both builds; the second leaves one lasting act on the target. */
const BUILDS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })];

/** A supervisor decision the provider never answered, as the loop's decide throws it. */
const silent = (code = "llm.provider_timeout"): Step => () => {
  throw new AutomationStudioLlmUnusableDecisionError([code]);
};
const kinds = (built: ReturnType<typeof project>) => built.dispatched.map((request) => request.briefs.map((sent) => sent.kind));
const LEFT = "Still on the target from this build: trial step 1 \"press hold for place_hold\".";

describe("a supervisor whose model provider stopped answering", () => {
  it("sends no reset brief, and its ending names the act left and the provider's stop under its code", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), silent(), silent(), silent()], built, { propagateDecisionErrors: true });

    expect(run.outcome.loop).toMatchObject({ ok: false, code: "llm_evidence_loop.provider_unavailable" });
    expect(run.outcome.status).toBe("ended");
    // Only the builds were dispatched: no reset was asked of the silent provider.
    expect(kinds(built)).toEqual([["build", "build"]]);
    expect(built.ledger.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", owner: "brief-2", inPlace: true })]);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("partial");
    expect(view?.record.ending?.reason).toBe(
      "The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out, "
      + "before a whole trial passed (flow_bootstrap.provider_unavailable). No reset was sent to put the target back: it would need the same provider. " + LEFT
    );
    expect(run.outcome.ending?.reason).not.toContain("The supervisor stopped");
  });

  it("says the provider could not be reached, and no reset, when nothing of the build is left", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    const unreachable = "llm.provider_network_error";
    await supervise([call(IDS.writePlan, TWO_PART), silent(unreachable), silent(unreachable), silent(unreachable)], built, { propagateDecisionErrors: true });

    expect(kinds(built)).toEqual([]);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("blocked");
    expect(view?.record.ending?.reason).toBe("The build stopped because the AI model provider could not be reached: 3 requests in a row got no answer, before a whole trial passed (flow_bootstrap.provider_unavailable).");
  });
});

describe("a supervisor a guard stopped, beside it", () => {
  // Completions with nothing assembled, refused until the no-progress guard stalls the loop.
  const unassembled = () => ({ kind: "complete", result: { revision: 1, digest: "a".repeat(64) } });

});
