// What Core keeps of the layer a dispatch says stood over the page (CC7,
// t799, `../obstruction-of.ts`), and which of its ways out Core may press
// (`../obstruction-way-out.ts`). An example library site's notice.

import { describe, expect, it } from "vitest";
import { automationStudioObstructionOf } from "../obstruction-of.ts";
import { automationStudioObstructionWayOut } from "../obstruction-way-out.ts";

const CLOSE = { intent: "dismiss", definitionId: "test.output.press", controlRef: { handle: "h-close" } };

describe("automationStudioObstructionOf", () => {
  it("keeps each field in its shape, and nothing a producer put beside them", () => {
    const payload = { status: "failed", obstruction: { id: "layer.holds", name: "  Place a hold\n on this title ", kind: "overlay", covers: "target.borrow", dismiss: [CLOSE], colour: "red" } };
    expect(automationStudioObstructionOf(payload)).toEqual({ id: "layer.holds", name: "Place a hold on this title", kind: "overlay", covers: "target.borrow", dismiss: [CLOSE] });
  });

  it("reads the old kind words as Core's generic ones", () => {
    const kinds = ["consent", "promotion", "dialog", "assistant", "rate_limit", "notice", "other"].map((kind) => automationStudioObstructionOf({ obstruction: { kind, dismiss: [] } })?.kind);
    expect(kinds).toEqual(["overlay", "notice", "other", "assistant", "rate_limit", "notice", "other"]);
  });

  it.each<[string, unknown]>([
    ["no payload", undefined],
    ["an array payload", [{ obstruction: { kind: "notice", dismiss: [] } }]],
    ["no field", { status: "failed" }],
    ["a field that is not an object", { obstruction: "notice" }],
    ["an unknown kind", { obstruction: { kind: "robot_check", dismiss: [CLOSE] } }],
    ["no kind", { obstruction: { dismiss: [CLOSE] } }],
    ["no dismiss list", { obstruction: { kind: "notice" } }],
    ["a dismiss that is not a list", { obstruction: { kind: "notice", dismiss: CLOSE } }],
    ["the field nested in the client's own result", { result: { obstruction: { kind: "notice", dismiss: [] } } }]
  ])("reads no obstruction from %s", (_name, payload) => {
    expect(automationStudioObstructionOf(payload)).toBeUndefined();
  });

  it("drops a malformed field alone and keeps the obstruction", () => {
    const read = automationStudioObstructionOf({ obstruction: { id: "the holds notice", name: 4, kind: "notice", covers: "x".repeat(81), dismiss: [] } });
    expect(read).toEqual({ kind: "notice", dismiss: [] });
  });

  it("keeps a stated wait only on a slow-down, as a whole number from 1 ms to ten minutes", () => {
    const waitOf = (kind: string, retryAfterMs: unknown) => automationStudioObstructionOf({ obstruction: { kind, retryAfterMs, dismiss: [] } })?.retryAfterMs;
    expect(waitOf("rate_limit", 12_000)).toBe(12_000);
    expect(waitOf("rate_limit", 600_000)).toBe(600_000);
    expect([waitOf("rate_limit", 0), waitOf("rate_limit", 600_001), waitOf("rate_limit", 1.5), waitOf("rate_limit", "12000"), waitOf("notice", 12_000)]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("keeps each way out by its intent, its fields only in their shapes, and at most six", () => {
    const read = automationStudioObstructionOf({ obstruction: { kind: "notice", dismiss: [
      { intent: "close", definitionId: "test.output.press" },
      "Close",
      { intent: "accept", definitionId: "press the button", controlRef: { $state: { path: "secret" } }, action: "forward" },
      { intent: "neutral", controlRef: { text: "x".repeat(9_000) } },
      { intent: "dismiss", definitionId: "test.output.back", action: "back", extra: true },
      ...Array.from({ length: 8 }, () => CLOSE)
    ] } });
    expect(read?.dismiss).toHaveLength(6);
    expect(read?.dismiss.slice(0, 3)).toEqual([{ intent: "accept" }, { intent: "neutral" }, { intent: "dismiss", definitionId: "test.output.back", action: "back" }]);
  });
});

describe("automationStudioObstructionWayOut", () => {
  const withWays = (dismiss: unknown[]) => automationStudioObstructionOf({ obstruction: { kind: "overlay", dismiss } });

  it("chooses the first way out that closes the layer, over an earlier neutral one", () => {
    const neutral = { intent: "neutral", definitionId: "test.output.press", controlRef: { handle: "h-later" } };
    expect(automationStudioObstructionWayOut(withWays([neutral, CLOSE]))).toEqual(CLOSE);
    expect(automationStudioObstructionWayOut(withWays([neutral]))).toEqual(neutral);
  });

  it("never chooses a way out that accepts, nor one Core cannot run", () => {
    const accept = { intent: "accept", definitionId: "test.output.press", controlRef: { handle: "h-join" } };
    expect(automationStudioObstructionWayOut(withWays([accept]))).toBeUndefined();
    expect(automationStudioObstructionWayOut(withWays([{ intent: "dismiss", controlRef: { handle: "h-close" } }]))).toBeUndefined();
    expect(automationStudioObstructionWayOut(withWays([{ intent: "dismiss", definitionId: "test.output.press" }]))).toBeUndefined();
    expect(automationStudioObstructionWayOut(withWays([]))).toBeUndefined();
    expect(automationStudioObstructionWayOut(undefined)).toBeUndefined();
  });

  it("chooses the browser's own back with no target", () => {
    expect(automationStudioObstructionWayOut(withWays([{ intent: "dismiss", definitionId: "test.output.back", action: "back" }]))).toEqual({ intent: "dismiss", definitionId: "test.output.back", action: "back" });
  });
});
