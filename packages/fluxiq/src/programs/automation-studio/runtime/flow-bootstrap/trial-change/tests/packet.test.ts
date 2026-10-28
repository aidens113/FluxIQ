import { describe, expect, it } from "vitest";
import { automationStudioTrialSiteChangePacket as packet, type AutomationStudioTrialReading, type AutomationStudioTrialWitness } from "../index.ts";

// The bounded `siteChange` packet the judge sees: counts and readable lines,
// every act with its row (an `already_in_state` pass included), and never an
// opaque group, scope, place, subject or state token.

const OPAQUE = "OPAQUE";
const cart: AutomationStudioTrialWitness = { id: "w1", kind: "list", group: `g-${OPAQUE}-cart`, where: "the cart page", steps: [2], parts: ["p1"] };
const like: AutomationStudioTrialWitness = { id: "w2", kind: "control", place: `pl-${OPAQUE}-like`, where: "the post page", steps: [4], parts: ["p2"] };
const cartAt = (state: string, lines?: AutomationStudioTrialReading["lines"]): AutomationStudioTrialReading => ({
  source: "core_look",
  location: "https://shop.example/cart",
  collections: [{ scope: `sc-${OPAQUE}`, group: `g-${OPAQUE}-cart`, subjects: [`s-${OPAQUE}-a`, `s-${OPAQUE}-b`], states: { [`s-${OPAQUE}-a`]: `st-${OPAQUE}-${state}`, [`s-${OPAQUE}-b`]: `st-${OPAQUE}-1` } }],
  ...(lines ? { lines } : {})
});
const likeAt = (on: number, source: AutomationStudioTrialReading["source"] = "core_look"): AutomationStudioTrialReading => ({ source, controls: { [`pl-${OPAQUE}-like`]: { [`st-${OPAQUE}-on`]: on, [`st-${OPAQUE}-off`]: 1 - on } } });

const built = () => packet({
  witnesses: [cart, like],
  readings: { w1: { before: { ...cartAt("9"), source: "latest_read" }, after: cartAt("10", { gone: ["Lamp, quantity 9"], added: ["Lamp, quantity 10"] }) }, w2: { before: likeAt(1), after: likeAt(1, "end_view") } },
  acts: [
    { step: 2, outcome: "changed", witness: "w1", parts: ["p1"] },
    { step: 4, pass: { number: 1, of: 2 }, row: "Pinned: welcome post", outcome: "already_in_state", witness: "w2", parts: ["p2"] }
  ],
  leftFromEarlier: [{ did: "added one lamp to the cart", where: "the cart page" }],
  proofs: [
    { part: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "one more lamp" }, proof: "shown", steps: [2] },
    { part: "p2", effect: { kind: "end_state", state: "the post is liked" }, proof: "carried", steps: [4] },
    { part: "p3", proof: "none", steps: [] }
  ]
});

describe("the siteChange packet", () => {
  it("shows the list line's change as counts plus the readable lines, with each side's source", () => {
    const [w1, w2] = built().witnesses;
    expect(w1).toEqual({ id: "w1", kind: "list", where: "the cart page", steps: [2], parts: ["p1"], before: { source: "latest_read", rows: 2 }, after: { source: "core_look", rows: 2 }, change: { added: 0, removed: 0, changed: 1, unchanged: 1, lines: { gone: ["Lamp, quantity 9"], added: ["Lamp, quantity 10"] } } });
    expect(w2).toEqual({ id: "w2", kind: "control", where: "the post page", steps: [4], parts: ["p2"], before: { source: "core_look", state: { "state 1": 0, "state 2": 1 } }, after: { source: "end_view", state: { "state 1": 0, "state 2": 1 } }, change: "none" });
  });

  it("lists an already_in_state pass with its row, the acts left from earlier, and every typed proof", () => {
    const sent = built();
    expect(sent.acts).toContainEqual({ step: 4, pass: { number: 1, of: 2 }, row: "Pinned: welcome post", outcome: "already_in_state", witness: "w2", parts: ["p2"] });
    expect(sent.leftFromEarlier).toEqual([{ did: "added one lamp to the cart", where: "the cart page" }]);
    expect(sent.proofs.map((entry) => [entry.part, entry.proof])).toEqual([["p1", "shown"], ["p2", "carried"]]);
  });

  it("never carries an opaque token", () => {
    expect(JSON.stringify(built())).not.toContain(OPAQUE);
    const unreadOnly = packet({ witnesses: [cart, like], readings: { w1: { before: cartAt("9") }, w2: { after: likeAt(0) } }, acts: [], proofs: [] });
    expect(JSON.stringify(unreadOnly)).not.toContain(OPAQUE);
    expect(unreadOnly.witnesses.map((entry) => [entry.before, entry.after, entry.change])).toEqual([[{ source: "core_look", rows: 2 }, "unread", "unread"], ["unread", { source: "core_look", state: { "state 1": 1, "state 2": 0 } }, "unread"]]);
  });

  it("caps readable lines at 20 per side and 200 characters each, marking every cut", () => {
    const long = "x".repeat(250);
    const gone = Array.from({ length: 25 }, (_, index) => `line ${index}`);
    const sent = packet({ witnesses: [cart], readings: { w1: { before: cartAt("9"), after: cartAt("10", { gone, added: [long] }) } }, acts: [{ step: 2, row: long, outcome: "changed", parts: [] }], proofs: [] });
    const change = sent.witnesses[0]!.change as { lines: { gone: string[]; added: string[]; cut?: { gone: number; added: number } } };
    expect(change.lines.gone).toHaveLength(20);
    expect(change.lines.cut).toEqual({ gone: 5, added: 0 });
    expect(change.lines.added[0]).toHaveLength(200);
    expect(change.lines.added[0]!.endsWith("…")).toBe(true);
    expect(sent.acts[0]!.row).toHaveLength(200);
  });
});
