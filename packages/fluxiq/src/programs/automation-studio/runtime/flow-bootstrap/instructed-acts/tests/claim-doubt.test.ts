import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct } from "../contracts.ts";
import { automationStudioInstructedActClaimDoubt } from "../claim-doubt.ts";

const add: AutomationStudioInstructedAct = { id: "a1", kind: "add_to", verb: "add", quote: "Add the hub to my cart." };
function step(target?: string): AutomationStudioFlowDraftStep {
  return { id: "d1", position: 1, iteration: 1, actionId: "domain.press", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"], ...(target === undefined ? {} : { words: { target } }) };
}

describe("advisory act-claim feedback", () => {
  it("identifies same-place wrong-control claims without modifying the draft", () => {
    const draft = step("Spain");
    const before = structuredClone(draft);
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toContain('control is "Spain"');
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toContain("whole-Flow test");
    expect(draft).toEqual(before);
  });

  it.each(["Add to cart", "Add to basket", "Put in wishlist", "ADD TO WATCHLIST"])("recognizes existing act-kind vocabulary: %s", (target) => {
    const draft = step(target);
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toBeUndefined();
  });

  it.each([undefined, "", "   "])("does not infer a mismatch from missing control words: %s", (target) => {
    const draft = step(target);
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toBeUndefined();
  });

  it("uses the recorded control when current target words are blank", () => {
    const draft = { ...step("  "), control: "Spain" };
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toContain('"Spain"');
  });

  it.each(["set", "open"] as const)("does not doubt a %s act whose control names only a value", (kind) => {
    const draft = step("Spain");
    expect(automationStudioInstructedActClaimDoubt({ ...add, kind, verb: kind }, draft, [draft])).toBeUndefined();
  });

  it.each(["Get coupons", "Get vouchers"])("recognizes plural claim controls: %s", (target) => {
    const draft = step(target);
    expect(automationStudioInstructedActClaimDoubt({ ...add, kind: "claim", verb: "claim" }, draft, [draft])).toBeUndefined();
  });

  it("matches whole vocabulary words rather than substrings", () => {
    const draft = step("Address");
    expect(automationStudioInstructedActClaimDoubt(add, draft, [draft])).toBeDefined();
  });

  it("notes navigation without advising an unavailable earlier action", () => {
    const draft = { ...step("Product details"), replay: { from: { location: "opaque:list" } } };
    const next = { ...step("Quantity"), id: "d2", position: 2, replay: { from: { location: "opaque:item" } } };
    const said = automationStudioInstructedActClaimDoubt(add, draft, [draft, next]);
    expect(said).toContain("different place");
    expect(said).toContain("distinct step");
    expect(said).not.toContain("reorder");
  });
});
