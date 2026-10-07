// The route the person named, beside the draft and at completion (D phase 2).
//
// The draft shows the route once the build's one read of it has settled, and
// completion is refused while the Flow skips a place on it, takes its places
// out of order, or starts deeper than where the work begins without the route
// being confirmed open. The read stays lazy: it is sent from here only for a
// Flow whose first step goes deeper, and only while nothing has read it yet.
import { describe, expect, it, vi } from "vitest";
import {
  automationStudioInstructionSetDigest,
  type AutomationStudioInstructionRouteReading,
  type AutomationStudioInstructionText
} from "../../../action-permissions/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftActs } from "../draft-acts.ts";
import { automationStudioFlowBootstrapDraftRoute } from "../draft-route.ts";

const START = "https://social.test/";
const arrival = { node: "web.output.browser-navigate", parameter: "url" };
const instructions: AutomationStudioInstructionText[] = [{ instructionId: "i1", title: "Requests", body: "Open the menu, then Friends, then Requests, and confirm every request." }];
const digest = automationStudioInstructionSetDigest(instructions);
const span = { start: 0, end: 1 };
const PLACES = ["the menu", "Friends", "Requests"];
const named: AutomationStudioInstructionRouteReading = {
  state: "named", instructionSetDigest: digest, routeId: "route.1", instructionId: "i1", instructionDigest: "sha256:0", quote: "Open the menu, then Friends, then Requests", sourceSpan: span,
  // Given out of order, so the route is read by `order` and not by position.
  waypoints: [3, 1, 2].map((order) => ({ id: `w${order}`, order, instructionId: "i1", instructionDigest: "sha256:0", quote: PLACES[order - 1]!, sourceSpan: span }))
};
const open: AutomationStudioInstructionRouteReading = { state: "open", instructionSetDigest: digest };

function navigate(url: string, places?: string[]): AutomationStudioFlowDraftStep {
  return {
    position: 1, id: "d1", iteration: 1, actionId: arrival.node, toolId: "core.run_node",
    input: { node: arrival.node, parameters: { url }, consequences: [] },
    effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, ...(places ? { places } : {})
  };
}

function press(position: number, places?: string[], over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", toolId: "core.run_node",
    input: { node: "web.output.dom-click", parameters: { target: `t${position}` }, consequences: [] },
    effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, ...(places ? { places } : {}), ...over
  };
}

/** An accessor whose one read answers `answer`, counted. */
function accessor(known: AutomationStudioInstructionRouteReading, answer: AutomationStudioInstructionRouteReading = known) {
  let reading = known;
  const read = vi.fn(async () => { reading = answer; return answer; });
  return { read, peek: () => reading };
}

const route = (reading: ReturnType<typeof accessor>) =>
  automationStudioFlowBootstrapDraftRoute({ route: reading, activeInstructions: instructions, startLocation: START, arrival });

const instructionOf = async (check: ReturnType<typeof route>, steps: AutomationStudioFlowDraftStep[]) => {
  const refused = await check.routeCheck!(steps);
  return refused ? { codes: refused.issueCodes, text: String(refused.feedback.instruction) } : undefined;
};

describe("the route the draft shows", () => {
  it("is the person's words and each place's words in the route's order, once named", () => {
    expect(route(accessor(named)).route!()).toEqual({ state: "named", quote: "Open the menu, then Friends, then Requests", places: PLACES });
  });

  it("is open when the read said no route, and nothing while unread, unavailable or stale", () => {
    expect(route(accessor(open)).route!()).toEqual({ state: "open" });
    expect(route(accessor({ state: "unread" })).route!()).toBeUndefined();
    expect(route(accessor({ state: "unavailable", reason: "transport" })).route!()).toBeUndefined();
    const stale = automationStudioFlowBootstrapDraftRoute({ route: accessor(named), activeInstructions: [{ ...instructions[0]!, body: "Something else." }], startLocation: START, arrival });
    expect(stale.route!()).toBeUndefined();
  });
});

describe("completion against the route the person named", () => {
  // (a)
  it("refuses a Flow whose only step on the middle place was dropped, naming that place", async () => {
    const steps = [navigate(START), press(2, ["r1"]), press(3, ["r2"], { disposition: "dropped" }), press(4, ["r3"])];
    const refused = await instructionOf(route(accessor(named)), steps);
    expect(refused?.text).toBe("The person named the route \"Open the menu, then Friends, then Requests\". No step in the Flow is on r2 (Friends): keep or add the steps that go through it, in order, and say which with place (place \"r2\").");
    expect(refused?.codes).toEqual(["bootstrap.route_place_missing"]);
  });

  it("accepts a Flow on every place in order", async () => {
    expect(await instructionOf(route(accessor(named)), [navigate(START), press(2, ["r1"]), press(3, ["r2"]), press(4, ["r2", "r3"])])).toBeUndefined();
  });

  // (b)
  it("refuses places claimed out of order", async () => {
    const refused = await instructionOf(route(accessor(named)), [navigate(START), press(2, ["r1"]), press(3, ["r3"]), press(4, ["r2"])]);
    expect(refused?.text).toBe("The person named the route \"Open the menu, then Friends, then Requests\". r3 (Requests) is reached before a place that comes earlier on it: the Flow goes through the places in order, so reorder the steps or correct their place.");
    expect(refused?.codes).toEqual(["bootstrap.route_out_of_order"]);
  });

  it("refuses a first step that goes straight to a deeper address on a named route", async () => {
    const refused = await instructionOf(route(accessor(named)), [navigate(`${START}friends/requests`), press(2, ["r1"]), press(3, ["r2"]), press(4, ["r3"])]);
    expect(refused?.text).toBe("The person named the route \"Open the menu, then Friends, then Requests\": the Flow goes through the menu, then Friends, then Requests in that order, so its first step cannot go straight to a deeper address. Rerun step 1 with startLocation, keep a step in the Flow on each place, and say which with place.");
    expect(refused?.codes).toEqual(["bootstrap.route_shortcut"]);
  });

  it("lets a deeper first step stand when it says it is on the route's first place", async () => {
    expect(await instructionOf(route(accessor(named)), [navigate(`${START}menu`, ["r1"]), press(2, ["r2"]), press(3, ["r3"])])).toBeUndefined();
  });

  // (c)
  it("accepts a deeper first step once the read said the person named no route", async () => {
    const reading = accessor(open);
    expect(await instructionOf(route(reading), [navigate(`${START}friends/requests`), press(2)])).toBeUndefined();
    expect(reading.read).not.toHaveBeenCalled();
  });

  // (d)
  it("refuses a deeper first step while the route could not be read, and once a read fails", async () => {
    const text = "Whether the person named a route could not be confirmed, so the Flow's first step cannot go straight to a deeper address: rerun step 1 with startLocation and keep the steps that travel from there.";
    const steps = [navigate(`${START}friends/requests`), press(2)];
    expect(await instructionOf(route(accessor({ state: "unavailable", reason: "ambiguous" })), steps)).toEqual({ codes: ["bootstrap.route_unconfirmed"], text });
    const failing = accessor({ state: "unread" }, { state: "unavailable", reason: "transport" });
    expect(await instructionOf(route(failing), steps)).toEqual({ codes: ["bootstrap.route_unconfirmed"], text });
    expect(failing.read).toHaveBeenCalledTimes(1);
  });

  it("reads a deeper first step against a stale route as unconfirmed", async () => {
    const stale = automationStudioFlowBootstrapDraftRoute({ route: accessor(open), activeInstructions: [{ ...instructions[0]!, body: "Something else." }], startLocation: START, arrival });
    expect((await instructionOf(stale, [navigate(`${START}friends/requests`), press(2)]))?.codes).toEqual(["bootstrap.route_unconfirmed"]);
  });

  // (e)
  it("sends the read only for a shortcut while unread, and at most once", async () => {
    const quiet = accessor({ state: "unread" }, named);
    const check = route(quiet);
    expect(await instructionOf(check, [navigate(START), press(2)])).toBeUndefined();
    expect(await instructionOf(check, [navigate(`${START}/`), press(2)])).toBeUndefined();
    expect(quiet.read).not.toHaveBeenCalled();

    // An accessor that never settles its peek is still asked only once.
    const stuck = { read: vi.fn(async () => ({ state: "unavailable", reason: "transport" }) as AutomationStudioInstructionRouteReading), peek: () => ({ state: "unread" }) as AutomationStudioInstructionRouteReading };
    const shortcut = automationStudioFlowBootstrapDraftRoute({ route: stuck, activeInstructions: instructions, startLocation: START, arrival });
    const deeper = [navigate(`${START}friends`), press(2)];
    expect((await instructionOf(shortcut, deeper))?.codes).toEqual(["bootstrap.route_unconfirmed"]);
    expect((await instructionOf(shortcut, deeper))?.codes).toEqual(["bootstrap.route_unconfirmed"]);
    expect(stuck.read).toHaveBeenCalledTimes(1);

    // A read that names the route refuses the shortcut it was sent for.
    const naming = accessor({ state: "unread" }, named);
    expect((await instructionOf(route(naming), deeper))?.codes).toEqual(["bootstrap.route_shortcut", "bootstrap.route_place_missing"]);
    expect(naming.read).toHaveBeenCalledTimes(1);
  });

  it("is no shortcut without a start location or an arrival node", async () => {
    const reading = accessor({ state: "unread" });
    const steps = [navigate(`${START}friends`), press(2)];
    expect(await automationStudioFlowBootstrapDraftRoute({ route: reading, activeInstructions: instructions, arrival }).routeCheck!(steps)).toBeUndefined();
    expect(await automationStudioFlowBootstrapDraftRoute({ route: reading, activeInstructions: instructions, startLocation: START }).routeCheck!(steps)).toBeUndefined();
    expect(reading.read).not.toHaveBeenCalled();
  });

  // (f)
  it("changes nothing with no route accessor", () => {
    expect(automationStudioFlowBootstrapDraftRoute({ activeInstructions: instructions, startLocation: START, arrival })).toEqual({});
    const acts = automationStudioFlowBootstrapDraftActs({ instructionText: "Confirm every request.", startLocation: START, arrival });
    expect(Object.keys(acts).sort()).toEqual(["acts", "actsMissing", "claimRefused"]);
  });

  it("is handed to the loop beside the acts when the build has a route", async () => {
    const acts = automationStudioFlowBootstrapDraftActs({ instructionText: "Confirm every request.", startLocation: START, arrival, route: accessor(named), activeInstructions: instructions });
    expect(Object.keys(acts).sort()).toEqual(["acts", "actsMissing", "claimRefused", "route", "routeCheck"]);
    expect(acts.route!()).toMatchObject({ state: "named", places: PLACES });
    expect((await acts.routeCheck!([navigate(START), press(2, ["r1"])]))?.issueCodes).toEqual(["bootstrap.route_place_missing"]);
  });
});
