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
    const payload = { status: "succeeded", clearedLayers: [{ kind: "notice", control: "No thanks", label: "No thanks, I would rather pay full price" }, { kind: "overlay", control: "Reject" }] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([{ kind: "notice", control: "No thanks" }, { kind: "overlay", control: "Reject" }]);
  });

  // CC7 (t799): an older client still sends the old words; each is read as its generic kind.
  it("reads the old kind words as Core's generic ones", () => {
    const payload = { clearedLayers: [{ kind: "consent", control: "Reject" }, { kind: "promotion", control: "No thanks" }, { kind: "dialog", control: "Close" }, { kind: "assistant", control: "Hide" }, { kind: "rate_limit", control: "OK" }] };
    expect(automationStudioClearedLayersOf(payload).map((layer) => layer.kind)).toEqual(["overlay", "notice", "other", "assistant", "rate_limit"]);
  });

  // CC7 (t799): the layer's own identity, and the durable target of the pressed way out beside its definition.
  it("keeps a layer's id only as a short opaque token", () => {
    const payload = { clearedLayers: [
      { kind: "notice", control: "Close", id: "layer.holds-notice" },
      { kind: "notice", control: "Close", id: "The holds notice" },
      { kind: "notice", control: "Close", id: "x".repeat(81) },
      { kind: "notice", control: "Close", id: 7 }
    ] };
    expect(automationStudioClearedLayersOf(payload).map((layer) => layer.id)).toEqual(["layer.holds-notice", undefined, undefined, undefined]);
  });

  it("keeps the way out's control reference only as an inert JSON object of at most 8 KB, beside its definition", () => {
    const target = { handle: "h-close", fingerprint: { role: "button", text: "Not now" } };
    const pressed = { wayOut: "way-out.1", wayOutDefinitionId: "test.output.press" };
    const payload = { clearedLayers: [
      { kind: "notice", control: "Not now", ...pressed, controlRef: target },
      { kind: "notice", control: "Not now", wayOut: "way-out.1", controlRef: target },
      { kind: "notice", control: "Not now", ...pressed, controlRef: { text: "x".repeat(9_000) } },
      { kind: "notice", control: "Not now", ...pressed, controlRef: { nested: { $state: { path: "secret" } } } },
      { kind: "notice", control: "Not now", ...pressed, controlRef: ["h-close"] },
      { kind: "notice", control: "Not now", ...pressed, controlRef: "h-close" }
    ] };
    const layers = automationStudioClearedLayersOf(payload);
    expect(layers[0]).toEqual({ kind: "notice", control: "Not now", ...pressed, controlRef: target });
    expect(layers[0]!.controlRef).not.toBe(target);
    expect(layers.slice(1).map((layer) => layer.controlRef)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(layers[1]).toEqual({ kind: "notice", control: "Not now", wayOut: "way-out.1" });
    expect(layers[2]).toEqual({ kind: "notice", control: "Not now", ...pressed });
  });

  it.each(DISMISS_WORDS)("keeps the dismiss words %s as they are", (control) => {
    expect(automationStudioClearedLayersOf({ clearedLayers: [{ kind: "other", control }] })).toEqual([{ kind: "other", control }]);
  });

  it("collapses whitespace, hides token-shaped runs and holds the words to 40 characters", () => {
    const [spaced] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "other", control: "  Not \n\t now " }] });
    expect(spaced).toEqual({ kind: "other", control: "Not now" });
    const [token] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "other", control: "Close a1b2c3d4e5f6g7h8i9j0k1" }] });
    expect(token?.control).not.toMatch(/a1b2c3d4e5f6/u);
    const [long] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "other", control: "Close this window and never show me this again please" }] });
    expect(long!.control.length).toBeLessThanOrEqual(40);
  });

  it("drops an entry with an unknown kind or unreadable words, and keeps the rest", () => {
    const payload = { clearedLayers: [{ kind: "robot_check", control: "Close" }, { kind: "other", control: 4 }, { kind: "other", control: "   " }, "Close", null, [], { kind: "assistant", control: "Hide" }] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([{ kind: "assistant", control: "Hide" }]);
  });

  // t470: the domain's reference to the control it pressed rides beside the words, opaque to Core.
  it("keeps a way-out reference only as a short opaque token", () => {
    const payload = { clearedLayers: [
      { kind: "rate_limit", control: "OK", wayOut: "way-out.3f2a9c" },
      { kind: "other", control: "Close", wayOut: "Close this notice now" },
      { kind: "other", control: "Close", wayOut: { selector: "#ok" } },
      { kind: "notice", control: "No thanks", wayOut: "x".repeat(81) }
    ] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([
      { kind: "rate_limit", control: "OK", wayOut: "way-out.3f2a9c" },
      { kind: "other", control: "Close" },
      { kind: "other", control: "Close" },
      { kind: "notice", control: "No thanks" }
    ]);
  });

  // t516: the layer's own name and the pressed control's own name ride beside the closed words, bounded the way the
  // activity stream bounds text, so the run can learn the interruption as a handler that waits for that layer by its
  // words and presses that control.
  it("keeps the layer's name and the pressed control's name, bounded, and drops an unreadable one", () => {
    const payload = { clearedLayers: [
      { kind: "other", control: "Maybe later", name: "  Join the reading club\n for free holds ",controlName: "Maybe later, I will browse first" },
      { kind: "other", control: "Close", name: 4, controlName: "   " },
      { kind: "other", control: "Close", name: "A notice ".repeat(30), controlName: "Close a1b2c3d4e5f6g7h8i9j0k1" }
    ] };
    const [named, unnamed, bounded] = automationStudioClearedLayersOf(payload);
    expect(named).toEqual({ kind: "other", control: "Maybe later", name: "Join the reading club for free holds", controlName: "Maybe later, I will browse first" });
    expect(unnamed).toEqual({ kind: "other", control: "Close" });
    expect(bounded!.name!.length).toBeLessThanOrEqual(120);
    expect(bounded!.controlName).not.toMatch(/a1b2c3d4e5f6/u);
  });

  // t516: the node definition the domain says presses the way out rides beside its reference, as an identifier only.
  it("keeps the way out's pressing definition only as an identifier, and only beside a way out", () => {
    const payload = { clearedLayers: [
      { kind: "other", control: "No thanks", wayOut: "way-out.3f2a9c", wayOutDefinitionId: "test.output.press" },
      { kind: "other", control: "No thanks", wayOut: "way-out.3f2a9d", wayOutDefinitionId: "press the button" },
      { kind: "other", control: "No thanks", wayOutDefinitionId: "test.output.press" }
    ] };
    expect(automationStudioClearedLayersOf(payload)).toEqual([
      { kind: "other", control: "No thanks", wayOut: "way-out.3f2a9c", wayOutDefinitionId: "test.output.press" },
      { kind: "other", control: "No thanks", wayOut: "way-out.3f2a9d" },
      { kind: "other", control: "No thanks" }
    ]);
  });

  it("keeps at most twelve layers", () => {
    const clearedLayers = Array.from({ length: 20 }, () => ({ kind: "rate_limit", control: "OK" }));
    expect(automationStudioClearedLayersOf({ clearedLayers })).toHaveLength(12);
  });

  it.each<[string, unknown]>([
    ["no payload", undefined],
    ["a string payload", "clearedLayers"],
    ["an array payload", [{ kind: "other", control: "Close" }]],
    ["no field", { status: "succeeded" }],
    ["a field that is not a list", { clearedLayers: { kind: "other", control: "Close" } }],
    ["the field nested in the client's own result", { result: { clearedLayers: [{ kind: "other", control: "Close" }] } }]
  ])("reads no layers from %s", (_name, payload) => {
    expect(automationStudioClearedLayersOf(payload)).toEqual([]);
  });
});

// t799 (w7): the web sends the definition and the durable target without a `wayOut` token.
describe("automationStudioClearedLayersOf, a way out pressed by definition and target", () => {
  const controlRef = { selector: "#help .close", element: { tagName: "button", accessibleName: "Close", role: "button", context: { dialog: "Archive help panel" } } };

  it("keeps the definition and the target without a wayOut token", () => {
    const [layer] = automationStudioClearedLayersOf({ clearedLayers: [{ kind: "overlay", control: "Close", id: "layer:1a2b3c4d", name: "Archive help panel", wayOutDefinitionId: "domain.archive.press", controlRef }] });
    expect(layer).toEqual({ kind: "overlay", control: "Close", id: "layer:1a2b3c4d", name: "Archive help panel", wayOutDefinitionId: "domain.archive.press", controlRef });
  });

  it("never keeps a target without a definition, nor a definition with an unusable target and no token", () => {
    const layers = automationStudioClearedLayersOf({ clearedLayers: [
      { kind: "overlay", control: "Close", controlRef },
      { kind: "overlay", control: "Close", wayOutDefinitionId: "domain.archive.press", controlRef: { $state: "x" } },
      { kind: "overlay", control: "Close", wayOut: "way-out.1", wayOutDefinitionId: "domain.archive.press", controlRef: { $state: "x" } }
    ] });
    expect(layers).toEqual([
      { kind: "overlay", control: "Close" },
      { kind: "overlay", control: "Close" },
      { kind: "overlay", control: "Close", wayOut: "way-out.1", wayOutDefinitionId: "domain.archive.press" }
    ]);
  });
});
