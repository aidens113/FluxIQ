// The route the person's instruction names, as the build's one instruction
// read answers it and Core keeps it (D phase 1, `docs/working/mvp-live-
// continuation-2026-10-03/reports/d-grounded-waypoint-contract.md`).
//
// The user's rule: a route the person names must be followed; a Flow may start
// where the work begins unless the person names the route. So "open" is only
// ever an explicit, well-formed answer, and anything Core cannot ground is
// "unavailable" -- never open, which would let a build skip a named route.
import { describe, expect, it } from "vitest";
import { automationStudioInstructionDigest, type AutomationStudioInstructionText } from "../../instructed.ts";
import { automationStudioInstructionSetDigest, currentAutomationStudioInstructionRoute, readAutomationStudioInstructionRoute, type AutomationStudioInstructionRouteReading } from "../index.ts";

const GOAL: AutomationStudioInstructionText = {
  instructionId: "instruction.goal",
  title: "Accept friend requests",
  body: "On Chirply, go to the home page, open Friends, then Friend requests, and accept every request from someone in Leeds."
};
const OTHER: AutomationStudioInstructionText = { instructionId: "instruction.tone", title: "Tone", body: "Do not send any message." };
const ACTIVE = [GOAL, OTHER];
const TEXT = `${GOAL.title}\n${GOAL.body}`;
const ROUTE = "go to the home page, open Friends, then Friend requests";
const WAYPOINTS = ["the home page", "Friends", "Friend requests"];

function read(route: unknown, instructions: readonly AutomationStudioInstructionText[] = ACTIVE): AutomationStudioInstructionRouteReading {
  const result: Record<string, unknown> = { instructed: [] };
  if (route !== undefined) result.route = route;
  return readAutomationStudioInstructionRoute({ result, instructions });
}
const named = (overrides: Record<string, unknown> = {}) => read({ kind: "named", instructionId: GOAL.instructionId, quote: ROUTE, waypoints: WAYPOINTS, ...overrides });

describe("a named route", () => {
  it("is kept with each waypoint grounded in the person's words, in the order the read gave", () => {
    const reading = named();
    expect(reading.state).toBe("named");
    if (reading.state !== "named") return;
    expect(reading.instructionId).toBe(GOAL.instructionId);
    expect(reading.instructionDigest).toBe(automationStudioInstructionDigest(GOAL));
    expect(reading.instructionSetDigest).toBe(automationStudioInstructionSetDigest(ACTIVE));
    expect(TEXT.slice(reading.sourceSpan.start, reading.sourceSpan.end)).toBe(ROUTE);
    expect(reading.quote).toBe(ROUTE);
    expect(reading.waypoints.map((waypoint) => [waypoint.order, waypoint.quote, TEXT.slice(waypoint.sourceSpan.start, waypoint.sourceSpan.end)]))
      .toEqual([[1, "the home page", "the home page"], [2, "Friends", "Friends"], [3, "Friend requests", "Friend requests"]]);
  });

  it("finds a waypoint inside the route's own words, not the first place the label appears", () => {
    // "Friends" also begins "Friend requests"; inside the route, "Friends" occurs once.
    const reading = named();
    if (reading.state !== "named") throw new Error(reading.state);
    expect(reading.waypoints[1]!.sourceSpan.start).toBe(TEXT.indexOf("open Friends") + "open ".length);
  });

  it("carries Core's own ids, the same for the same reading and different for a different order", () => {
    const first = named();
    const again = named();
    const reordered = named({ waypoints: ["Friends", "the home page", "Friend requests"] });
    if (first.state !== "named" || again.state !== "named" || reordered.state !== "named") throw new Error("not named");
    expect(again.routeId).toBe(first.routeId);
    expect(again.waypoints.map((waypoint) => waypoint.id)).toEqual(first.waypoints.map((waypoint) => waypoint.id));
    expect(new Set(first.waypoints.map((waypoint) => waypoint.id)).size).toBe(3);
    expect(reordered.routeId).not.toBe(first.routeId);
    // A waypoint is the same words in the same place, whatever order it was read in.
    expect(reordered.waypoints.find((waypoint) => waypoint.quote === "Friends")!.id).toBe(first.waypoints[1]!.id);
  });

  it("grounds quotes copied with other case, spacing and typographic quotes, and keeps the person's own words", () => {
    const curly = { instructionId: "instruction.curly", title: "Curly", body: "Go to the Home page,   open “Friends”, then Friend requests." };
    const reading = read({ kind: "named", instructionId: curly.instructionId, quote: "go to the home page, open \"Friends\", then friend requests.", waypoints: ["HOME PAGE", "\"friends\"", "Friend   Requests"] }, [curly]);
    expect(reading.state).toBe("named");
    if (reading.state !== "named") return;
    expect(reading.quote).toBe("Go to the Home page,   open “Friends”, then Friend requests");
    expect(reading.waypoints.map((waypoint) => waypoint.quote)).toEqual(["Home page", "“Friends”", "Friend requests"]);
  });

  it("is not cut to the 300-character bound a permission quote has", () => {
    const stops = ["Accounts", "Billing", "Catalogue", "Deliveries", "Engineering", "Finance", "Grievances", "Hardware", "Inventory", "Journals", "Kitchens", "Logistics"].map((name) => `the ${name} section`);
    const body = `Start at the home page, then open ${stops.join(", then open ")}, and read the totals.`;
    const long = { instructionId: "instruction.long", title: "Long", body };
    const route = `Start at the home page, then open ${stops.join(", then open ")}`;
    expect(route.length).toBeGreaterThan(300);
    const reading = read({ kind: "named", instructionId: long.instructionId, quote: route, waypoints: ["the home page", ...stops] }, [long]);
    expect(reading.state).toBe("named");
    if (reading.state !== "named") return;
    expect(reading.quote).toBe(route);
    expect(reading.waypoints).toHaveLength(13);
  });

  it("counts offsets in UTF-16 code units over the title, a newline and the body", () => {
    const emoji = { instructionId: "instruction.emoji", title: "😀 Friends", body: "Open 𝐌enu, then Friend requests." };
    const reading = read({ kind: "named", instructionId: emoji.instructionId, quote: "Open 𝐌enu, then Friend requests", waypoints: ["𝐌enu", "Friend requests"] }, [emoji]);
    if (reading.state !== "named") throw new Error(reading.state);
    const text = `${emoji.title}\n${emoji.body}`;
    expect(text.slice(reading.waypoints[0]!.sourceSpan.start, reading.waypoints[0]!.sourceSpan.end)).toBe("𝐌enu");
    expect(reading.waypoints[0]!.sourceSpan.start).toBe(text.indexOf("𝐌"));
  });

  it("keeps no proof a model offers and claims nothing was visited", () => {
    const reading = named({ routeId: "route:forged", performed: true, waypoints: WAYPOINTS });
    if (reading.state !== "named") throw new Error(reading.state);
    expect(reading.routeId).not.toBe("route:forged");
    expect(Object.keys(reading).sort()).toEqual(["instructionDigest", "instructionId", "instructionSetDigest", "quote", "routeId", "sourceSpan", "state", "waypoints"]);
    expect(Object.keys(reading.waypoints[0]!).sort()).toEqual(["id", "instructionDigest", "instructionId", "order", "quote", "sourceSpan"]);
  });
});

describe("an open route", () => {
  it("is open only when the read explicitly says so", () => {
    expect(read({ kind: "open" })).toEqual({ state: "open", instructionSetDigest: automationStudioInstructionSetDigest(ACTIVE) });
  });
});

describe("a route Core cannot ground is unavailable, never open", () => {
  it.each([
    ["no route at all", undefined, "malformed"],
    ["a route that is not an object", "open", "malformed"],
    ["an unknown kind", { kind: "direct" }, "malformed"],
    ["the read could not tell", { kind: "unclear" }, "ambiguous"],
    ["a named route with no instruction id", { kind: "named", quote: ROUTE, waypoints: WAYPOINTS }, "malformed"],
    ["a named route with no waypoints", { kind: "named", instructionId: GOAL.instructionId, quote: ROUTE, waypoints: [] }, "malformed"],
    ["a waypoint that is not words", { kind: "named", instructionId: GOAL.instructionId, quote: ROUTE, waypoints: ["Friends", { label: "Friend requests" }] }, "malformed"],
    ["a waypoint of nothing but marks", { kind: "named", instructionId: GOAL.instructionId, quote: ROUTE, waypoints: ["Friends", " .. "] }, "malformed"],
    ["an instruction that is not active", { kind: "named", instructionId: "instruction.gone", quote: ROUTE, waypoints: WAYPOINTS }, "ungrounded"],
    ["route words the instruction does not have", { kind: "named", instructionId: GOAL.instructionId, quote: "go straight to Friend requests", waypoints: ["Friend requests"] }, "ungrounded"],
    ["route words in another instruction", { kind: "named", instructionId: OTHER.instructionId, quote: ROUTE, waypoints: WAYPOINTS }, "ungrounded"],
    ["a waypoint outside the route's words", { kind: "named", instructionId: GOAL.instructionId, quote: "open Friends, then Friend requests", waypoints: ["Friends", "Leeds"] }, "ungrounded"],
    ["one place listed twice", { kind: "named", instructionId: GOAL.instructionId, quote: ROUTE, waypoints: ["Friends", "Friend requests", "Friends"] }, "malformed"]
  ])("%s", (_name, route, reason) => {
    expect(read(route)).toEqual({ state: "unavailable", reason });
  });

  it("is ambiguous when the route's words occur twice in the instruction", () => {
    const twice = { instructionId: "instruction.twice", title: "Twice", body: "Open Friends, then Friend requests. Later, open Friends, then Friend requests." };
    expect(read({ kind: "named", instructionId: twice.instructionId, quote: "open Friends, then Friend requests", waypoints: ["Friends", "Friend requests"] }, [twice]))
      .toEqual({ state: "unavailable", reason: "ambiguous" });
  });

  it("is ambiguous when a waypoint's words occur twice inside the route", () => {
    const loop = { instructionId: "instruction.loop", title: "Loop", body: "Go home, open Friends, then go home again and open Groups." };
    expect(read({ kind: "named", instructionId: loop.instructionId, quote: "Go home, open Friends, then go home again and open Groups", waypoints: ["home", "Friends", "Groups"] }, [loop]))
      .toEqual({ state: "unavailable", reason: "ambiguous" });
  });

  it("is malformed, not shortened, past the waypoint bound", () => {
    const many = Array.from({ length: 21 }, (_, index) => `Stop${index + 1}`);
    const body = `Visit ${many.join(" then ")}.`;
    const instruction = { instructionId: "instruction.many", title: "Many", body };
    expect(read({ kind: "named", instructionId: instruction.instructionId, quote: body, waypoints: many }, [instruction]))
      .toEqual({ state: "unavailable", reason: "malformed" });
  });
});

describe("a reading stands only for the instructions it was read from", () => {
  it("is kept while every active instruction reads as it did", () => {
    const reading = named();
    expect(currentAutomationStudioInstructionRoute({ reading, activeInstructions: [OTHER, GOAL] })).toBe(reading);
  });

  it.each([
    ["the route's instruction was edited", [{ ...GOAL, body: `${GOAL.body} Thanks.` }, OTHER]],
    ["another instruction was edited", [GOAL, { ...OTHER, body: "Send nothing." }]],
    ["an instruction was made inactive", [GOAL]],
    ["an instruction was added", [...ACTIVE, { instructionId: "instruction.new", title: "New", body: "Be quick." }]]
  ])("lapses to stale when %s, open included", (_name, activeInstructions) => {
    for (const reading of [named(), read({ kind: "open" })]) {
      expect(currentAutomationStudioInstructionRoute({ reading, activeInstructions })).toEqual({ state: "unavailable", reason: "stale", instructionSetDigest: automationStudioInstructionSetDigest(ACTIVE) });
    }
  });

  it("leaves an unread or unavailable reading as it is", () => {
    const unavailable = read(undefined);
    expect(currentAutomationStudioInstructionRoute({ reading: { state: "unread" }, activeInstructions: [GOAL] })).toEqual({ state: "unread" });
    expect(currentAutomationStudioInstructionRoute({ reading: unavailable, activeInstructions: [GOAL] })).toBe(unavailable);
  });

  it("digests the instruction set whatever order the instructions are listed in", () => {
    expect(automationStudioInstructionSetDigest([OTHER, GOAL])).toBe(automationStudioInstructionSetDigest(ACTIVE));
    expect(automationStudioInstructionSetDigest(ACTIVE)).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
