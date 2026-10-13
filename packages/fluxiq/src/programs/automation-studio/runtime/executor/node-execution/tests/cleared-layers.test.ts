// What Core keeps of the layers a dispatch says the client closed over the
// page (`../cleared-layers.ts`): closed kinds, and dismiss words bounded the
// way the activity stream bounds text.

import { describe, expect, it } from "vitest";
import { automationStudioClearedLayersOf } from "../cleared-layers.ts";

// The dismiss phrases the web client may press (its allow-list), each of which
// must survive the bound unchanged.
const DISMISS_WORDS = [
  "Close", "Dismiss", "Minimise", "Hide", "Not now", "No thanks", "Maybe later", "Remind me later", "Later", "Skip", "Not interested",
  "Continue without", "Continue without accepting", "Reject", "Decline", "Refuse", "Deny", "Necessary only", "OK", "Got it", "Understood"
];

describe("automationStudioClearedLayersOf", () => {
  it("keeps each layer's kind and dismiss words, in order, and nothing beside them", () => {
    const payload = { status: "succeeded", clearedLayers: [{ kind: "promotion", control: "No thanks", label: "No thanks, I would rather pay full price" }, { kind: "consent", control: "Reject" }] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([{ kind: "promotion", control: "No thanks" }, { kind: "consent", control: "Reject" }]);
  });

  it.each(DISMISS_WORDS)("keeps the dismiss words %s as they are", (control) => {
    expect(automationStudioClearedLayersOf({ clearedLayers: [{ kind: "dialog", control }] })).toEqual([{ kind: "dialog", control }]);
  });

  it("collapses whitespace, hides token-shaped runs and holds the words to 40 characters", () => {
    const [spaced] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "dialog", control: "  Not \n\t now " }] });
    expect(spaced).toEqual({ kind: "dialog", control: "Not now" });
    const [token] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "dialog", control: "Close a1b2c3d4e5f6g7h8i9j0k1" }] });
    expect(token?.control).not.toMatch(/a1b2c3d4e5f6/u);
    const [long] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "dialog", control: "Close this window and never show me this again please" }] });
    expect(long!.control.length).toBeLessThanOrEqual(40);
  });

  it("drops an entry with an unknown kind or unreadable words, and keeps the rest", () => {
    const payload = { clearedLayers: [{ kind: "robot_check", control: "Close" }, { kind: "dialog", control: 4 }, { kind: "dialog", control: "   " }, "Close", null, [], { kind: "assistant", control: "Hide" }] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([{ kind: "assistant", control: "Hide" }]);
  });

  // t470: the domain's reference to the control it pressed rides beside the words, opaque to Core.
  it("keeps a way-out reference only as a short opaque token", () => {
    const payload = { clearedLayers: [
      { kind: "rate_limit", control: "OK", wayOut: "way-out.3f2a9c" },
      { kind: "dialog", control: "Close", wayOut: "Close this notice now" },
      { kind: "dialog", control: "Close", wayOut: { selector: "#ok" } },
      { kind: "promotion", control: "No thanks", wayOut: "x".repeat(81) }
    ] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([
      { kind: "rate_limit", control: "OK", wayOut: "way-out.3f2a9c" },
      { kind: "dialog", control: "Close" },
      { kind: "dialog", control: "Close" },
      { kind: "promotion", control: "No thanks" }
    ]);
  });

  // t516: the layer's own name and the pressed control's own name ride beside the closed words, bounded the way the
  // activity stream bounds text, so the run can learn the interruption as a handler that waits for that layer by its
  // words and presses that control.
  it("keeps the layer's name and the pressed control's name, bounded, and drops an unreadable one", () => {
    const payload = { clearedLayers: [
      { kind: "dialog", control: "Maybe later", name: "  Join the reading club\n for free holds ",controlName: "Maybe later, I will browse first" },
      { kind: "dialog", control: "Close", name: 4, controlName: "   " },
      { kind: "dialog", control: "Close", name: "A notice ".repeat(30), controlName: "Close a1b2c3d4e5f6g7h8i9j0k1" }
    ] };
    const [named, unnamed, bounded] = automationStudioClearedLayersOf(payload);
    expect(named).toEqual({ kind: "dialog", control: "Maybe later", name: "Join the reading club for free holds", controlName: "Maybe later, I will browse first" });
    expect(unnamed).toEqual({ kind: "dialog", control: "Close" });
    expect(bounded!.name!.length).toBeLessThanOrEqual(120);
    expect(bounded!.controlName).not.toMatch(/a1b2c3d4e5f6/u);
  });

  // t516: the node definition the domain says presses the way out rides beside its reference, as an identifier only.
  it("keeps the way out's pressing definition only as an identifier, and only beside a way out", () => {
    const payload = { clearedLayers: [
      { kind: "dialog", control: "No thanks", wayOut: "way-out.3f2a9c", wayOutDefinitionId: "test.output.press" },
      { kind: "dialog", control: "No thanks", wayOut: "way-out.3f2a9d", wayOutDefinitionId: "press the button" },
      { kind: "dialog", control: "No thanks", wayOutDefinitionId: "test.output.press" }
    ] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([
      { kind: "dialog", control: "No thanks", wayOut: "way-out.3f2a9c", wayOutDefinitionId: "test.output.press" },
      { kind: "dialog", control: "No thanks", wayOut: "way-out.3f2a9d" },
      { kind: "dialog", control: "No thanks" }
    ]);
  });

  it("keeps at most twelve layers", () => {
    const clearedLayers = Array.from({ length: 20 }, () => ({ kind: "rate_limit", control: "OK" }));
    expect(automationStudioClearedLayersOf({ clearedLayers })).toHaveLength(12);
  });

  it.each<[string, unknown]>([
    ["no payload", undefined],
    ["a string payload", "clearedLayers"],
    ["an array payload", [{ kind: "dialog", control: "Close" }]],
    ["no field", { status: "succeeded" }],
    ["a field that is not a list", { clearedLayers: { kind: "dialog", control: "Close" } }],
    ["the field nested in the client's own result", { result: { clearedLayers: [{ kind: "dialog", control: "Close" }] } }]
  ])("reads no layers from %s", (_name, payload) => {
    expect(automationStudioClearedLayersOf(payload)).toEqual([]);
  });
});
