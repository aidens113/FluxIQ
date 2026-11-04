import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_KNOWN_PARTS_NOTE, automationStudioKnownPartsOf, automationStudioPartOfferable } from "../index.ts";

const SHOP = "https://shop.example";
const OTHER = "https://other.example";

function card(partId: string, overrides: Partial<AutomationStudioSubflowCard> = {}): AutomationStudioSubflowCard {
  return {
    partId,
    version: 1,
    name: `Part ${partId}`,
    purpose: `Does ${partId}`,
    sites: [SHOP],
    inputs: [{ id: "query", name: "Search words", required: true }],
    outputs: [{ id: "results", name: "Results found", required: false }],
    fixedValues: [],
    lastingClasses: [],
    calls: [],
    shapeHash: partId.padEnd(64, "0"),
    trust: { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } },
    ...overrides
  };
}

const provisional = { tier: "provisional", counts: { judgedYes: 1, zeroModelRuns: 0, failures: 0 } } as const;

describe("the known-parts shortlist", () => {
  it("puts the start location's origin first, then the person's words by rank, then the order found", () => {
    const shortlist = automationStudioKnownPartsOf({
      candidates: [
        { card: card("other-best", { sites: [OTHER] }), textRank: 0 },
        { card: card("shop-late", { sites: [SHOP] }), textRank: 5 },
        { card: card("shop-early", { sites: [SHOP] }), textRank: 1 },
        { card: card("shop-unmatched", { sites: [SHOP] }) },
        { card: card("other-unmatched", { sites: [OTHER] }) }
      ],
      startOrigin: SHOP,
      askedClasses: []
    });
    expect(shortlist?.parts.map((part) => part.partId)).toEqual(["shop-early", "shop-late", "shop-unmatched", "other-best", "other-unmatched"]);
  });

  it("offers at most five, each part once", () => {
    const candidates = ["a", "b", "c", "d", "e", "f", "g"].map((id, index) => ({ card: card(id), textRank: index }));
    const shortlist = automationStudioKnownPartsOf({ candidates: [...candidates, { card: card("a") }], askedClasses: [] });
    expect(shortlist?.parts.map((part) => part.partId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("never offers an unproven part that does something lasting, nor one whose classes were not all asked", () => {
    const lasting = card("lasting", { lastingClasses: ["create_new"], trust: provisional });
    expect(automationStudioPartOfferable(card("unproven-lasting", { lastingClasses: ["create_new"] }), ["create_new"])).toBe(false);
    expect(automationStudioPartOfferable(lasting, ["create_new"])).toBe(true);
    expect(automationStudioPartOfferable(lasting, [])).toBe(false);
    expect(automationStudioPartOfferable(card("two", { lastingClasses: ["create_new", "send_or_publish"], trust: provisional }), ["create_new"])).toBe(false);
    expect(automationStudioPartOfferable(card("reads"), [])).toBe(true);
    const shortlist = automationStudioKnownPartsOf({
      candidates: [{ card: card("unproven-lasting", { lastingClasses: ["create_new"] }), textRank: 0 }, { card: lasting, textRank: 1 }, { card: card("reads"), textRank: 2 }],
      askedClasses: ["create_new"]
    });
    expect(shortlist?.parts.map((part) => part.partId)).toEqual(["lasting", "reads"]);
  });

  it("says nothing when nothing can be offered", () => {
    expect(automationStudioKnownPartsOf({ candidates: [], askedClasses: [] })).toBeUndefined();
    expect(automationStudioKnownPartsOf({ candidates: [{ card: card("x", { lastingClasses: ["create_new"] }) }], askedClasses: ["create_new"] })).toBeUndefined();
  });

  it("shows the card's name, purpose, sites, ports, fixed values, lasting classes and trust tier, and the one generic note", () => {
    const shortlist = automationStudioKnownPartsOf({ candidates: [{ card: card("saved", { fixedValues: ["red shoes"], lastingClasses: ["create_new"], trust: provisional }) }], askedClasses: ["create_new"] });
    expect(shortlist).toEqual({
      note: AUTOMATION_STUDIO_KNOWN_PARTS_NOTE,
      parts: [{
        partId: "saved",
        version: 1,
        name: "Part saved",
        purpose: "Does saved",
        sites: [SHOP],
        inputs: [{ id: "query", name: "Search words", required: true }],
        outputs: [{ id: "results", name: "Results found", required: false }],
        fixedValues: ["red shoes"],
        lastingClasses: ["create_new"],
        trust: "provisional"
      }]
    });
    expect(AUTOMATION_STUDIO_KNOWN_PARTS_NOTE).toMatch(/only a suggestion/u);
    expect(AUTOMATION_STUDIO_KNOWN_PARTS_NOTE).toMatch(/nothing runs unless you ask/u);
    expect(AUTOMATION_STUDIO_KNOWN_PARTS_NOTE).toMatch(/fixed values does that exact item/u);
  });
});
