// A read the test ran after acts it only checked (live run
// `run-muw6144a-e56f945d`, Cause C1): the round-1 draft listed the requests to
// confirm (step 6), repeated Confirm over them (step 7: one card already
// confirmed while exploring, `present`; three only checked, `verified`), and
// read the accepted ones (step 8). The test did none of the three Confirms, so
// the read kept only the row exploration had confirmed, and the judge took that
// as the Flow's answer. Such a read now says which checked steps came before it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioBuildTestStep } from "../../contracts.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, ROW_CONTEXT, SITE, navigate, present, replayed, report, verified, web } from "./draft-steps.ts";

const CONFIRM = "Confirm every request I have at least five mutual friends with.";
const REQUESTS = `${SITE}friends/requests/`;
const ROWS = ["Amara Osei", "Jonas Weber", "Lin Zhao", "Freya Holm"];

function read(position: number, where: JsonObject): AutomationStudioFlowDraftStep {
  const actionId = "web.output.dom-extract_list";
  const parameters = { fields: { name: {}, mutualFriends: {} }, where } as JsonObject;
  return {
    position, id: `d${position}`, iteration: position, actionId,
    input: { node: actionId, parameters }, ranWith: { node: actionId, parameters },
    effect: "observe", proposes: true, disposition: "kept", replay: { from: { location: REQUESTS } }
  };
}

const click = (position: number, name: string): AutomationStudioFlowDraftStep =>
  web(position, "web.output.dom-click", { selector: `#s${position}`, accessibleName: name }, SITE);

const start = navigate(1);
const route = [click(2, "Decline optional cookies"), click(3, "Friends"), click(4, "Close chat"), click(5, "Friend requests")];
const listing = read(6, { mutualFriends: { atLeast: 5 } });
const confirm = web(7, "web.output.dom-click", { selector: "#confirm", accessibleName: "Confirm" }, REQUESTS, {
  step: { routing: { kind: "repeat", over: "d6", through: "d7" } }
});
const accepted = read(8, { status: { equals: "Request accepted" } });

/** A checked step's outcome with one answer per row, as the walker writes it. */
function checkedPasses(step: AutomationStudioFlowDraftStep, codes: readonly string[]): AutomationStudioFlowDraftReplayOutcome {
  const passes = codes.map((code, index) => ({ pass: index + 1, status: "replayed", resultCode: `core.replay.${code}` }));
  return { ...(codes[0] === "verified" ? verified(step) : present(step)), passes } as AutomationStudioFlowDraftReplayOutcome;
}

function judged(steps: AutomationStudioFlowDraftStep[], outcomes: AutomationStudioFlowDraftReplayOutcome[]): AutomationStudioBuildTestStep[] {
  const observed = report(outcomes, [[listing, { ok: true, said: "kept 4 rows", readRows: { rows: ROWS.map((name) => ({ name })) } }]]);
  return automationStudioBuildTestResultSummary({
    steps, report: observed, nodes: [], instructionText: CONFIRM, startLocation: SITE, deniedEvidenceKeys: DENIED, rowContextKeys: ROW_CONTEXT
  }).buildTest!.steps;
}

const before = [start, ...route].map(replayed);

describe("a read the test ran after acts it only checked", () => {
  it("names the checked steps before it: run muw6144a's round 1, step 8 after step 7's three verified passes", () => {
    const steps = judged([start, ...route, listing, confirm, accepted], [
      ...before, replayed(listing), checkedPasses(confirm, ["present", "verified", "verified", "verified"]), replayed(accepted)
    ]);
    expect(steps[6]).toMatchObject({ step: 7, withheld: true });
    expect(steps[6]?.passes?.map((pass) => pass.outcome)).toEqual(["present", "verified", "verified", "verified"]);
    expect(steps[7]).toMatchObject({ step: 8, afterWithheld: [7] });
  });

  it("names a checked step that ran once, verified, too", () => {
    const single = web(7, "web.output.dom-click", { selector: "#confirm", accessibleName: "Confirm" }, REQUESTS);
    const steps = judged([start, ...route, listing, single, accepted], [...before, replayed(listing), verified(single), replayed(accepted)]);
    expect(steps[7]?.afterWithheld).toEqual([7]);
  });

  it("names none after checks whose every pass was already in place, since nothing was left undone", () => {
    const steps = judged([start, ...route, listing, confirm, accepted], [
      ...before, replayed(listing), checkedPasses(confirm, ["present", "present", "present", "present"]), replayed(accepted)
    ]);
    expect(steps[7]?.afterWithheld).toBeUndefined();
  });

  it("is never set on a read before the checked step, nor on the checked step or a change run again", () => {
    const steps = judged([start, ...route, listing, confirm, accepted], [
      ...before, replayed(listing), checkedPasses(confirm, ["present", "verified", "verified", "verified"]), replayed(accepted)
    ]);
    expect(steps.slice(0, 7).map((step) => step.afterWithheld)).toEqual(Array(7).fill(undefined));
  });
});
