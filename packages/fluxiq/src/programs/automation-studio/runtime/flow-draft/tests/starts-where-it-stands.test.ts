// A carried Flow whose first step has no captured start is tested from where
// the target stands (`../starts-where-it-stands.ts`, t688).
//
// Live run `run-mvblov2i-abb7d82e` (0080, 0086): the repair's draft held every
// saved step scheduled to run as saved, but the run being repaired had captured
// no start for the first, a navigate, so the draft was not replayable and its
// completion was refused `cannot_run_again` on step 1.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftReplayable, automationStudioFlowDraftStartsWhereItStands } from "../index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../llm/node-tools/index.ts";

function saved(start: boolean) {
  return automationStudioFlowDraftSeedFromFlow({
    declarationRequired: () => false,
    nodes: [
      { id: "open", definitionId: "fixture.navigate", parameterValues: { url: "https://venue.test/" } },
      { id: "read", definitionId: "fixture.read", parameterValues: { where: "all" } }
    ],
    edges: [{ id: "e1", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }],
    ...(start ? { startPages: { open: { location: "https://venue.test/" } } } : {})
  }).steps;
}

describe("a carried Flow whose first step has no captured start", () => {
  it("starts where the target stands, and can be replayed", () => {
    const steps = saved(false);
    expect(automationStudioFlowDraftStartsWhereItStands(steps)).toBe(true);
    expect(automationStudioFlowDraftReplayable(steps)).toBe(true);
  });

  it("does not, where the run captured the start: the test puts the target back there", () => {
    const steps = saved(true);
    expect(automationStudioFlowDraftStartsWhereItStands(steps)).toBe(false);
    expect(automationStudioFlowDraftReplayable(steps)).toBe(true);
  });

  it("does not for a first step changed since it was seeded, nor for one this build ran", () => {
    const changed = saved(false);
    changed[0]!.input.parameters = { url: "https://venue.test/other" };
    expect(automationStudioFlowDraftStartsWhereItStands(changed)).toBe(false);
    const ran = saved(false);
    ran[0] = { ...ran[0]!, id: "d1", ranWith: { node: "fixture.navigate", parameters: {} }, replay: {} };
    expect(automationStudioFlowDraftStartsWhereItStands(ran)).toBe(false);
    expect(automationStudioFlowDraftReplayable(ran)).toBe(false);
  });
});
