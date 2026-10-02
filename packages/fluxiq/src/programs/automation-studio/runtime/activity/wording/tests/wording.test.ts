import { describe, expect, it } from "vitest";
import { automationStudioActivityAction, automationStudioActivityHumanLabel, automationStudioActivityToolCall } from "../index.ts";

const CLICK = "web.output.dom-click";
const NAVIGATE = "web.output.browser-navigate";
const SNAPSHOT = "web.output.dom-capture_snapshot";
const QUOTE = { tagName: "button", role: "button", accessibleName: "  Get a   free quote " };
const call = (callId: string, value: Record<string, unknown>, toolId = "core.run_node") => ({ callId, toolId, value });

describe("automationStudioActivityHumanLabel", () => {
  it("keeps a person's words, collapsed and unquoted, and drops an id", () => {
    expect(automationStudioActivityHumanLabel("  “Open   search” ")).toBe("Open search");
    expect(automationStudioActivityHumanLabel("node.bootstrap.a.b")).toBeUndefined();
    expect(automationStudioActivityHumanLabel("   ")).toBeUndefined();
    expect(automationStudioActivityHumanLabel(7)).toBeUndefined();
    expect(automationStudioActivityHumanLabel("a".repeat(200), 10)).toHaveLength(10);
  });
});

describe("automationStudioActivityAction", () => {
  it("names a node by the verb in its id, with the element name it already carries", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: QUOTE } })).toBe("Clicking “Get a free quote”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { target: { handle: "target.4" } } })).toBe("Clicking on the page");
    expect(automationStudioActivityAction({ id: NAVIGATE, parameters: { url: "https://shop.example/services" } })).toBe("Opening a page");
    expect(automationStudioActivityAction({ id: SNAPSHOT })).toBe("Looking at the page");
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list" })).toBe("Reading the list");
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "secret", element: { accessibleName: "Search" } } })).toBe("Typing into “Search”");
    expect(automationStudioActivityAction({ id: "web.detect_repeating_structure" })).toBe("Looking for the list of items");
    expect(automationStudioActivityAction({ id: "web.output.dom-wait_for_selector" })).toBe("Waiting for the page");
  });

  it("prefers an authored label, and names nothing it does not know", () => {
    expect(automationStudioActivityAction({ id: CLICK, label: "open the services page" })).toBe("Open the services page");
    expect(automationStudioActivityAction({ id: CLICK, label: "node.bootstrap.x.y", parameters: { element: QUOTE } })).toBe("Clicking “Get a free quote”");
    expect(automationStudioActivityAction({ id: "vendor.frobnicate" })).toBeUndefined();
  });

  // F36 (`run-muqiho5c-e830ce01`): a control with no accessible name read "Click · the page" in the playback.
  it("names an element by its visible text when it has no accessible name, the name first when it has both", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { tagName: "div", visibleText: "Not now" } } })).toBe("Clicking “Not now”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { accessibleName: "Space Grey", visibleText: "Grey" } } })).toBe("Clicking “Space Grey”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { visibleText: "a.b" } } })).toBe("Clicking on the page");
  });

  it("never names an element with an id, and never reads a typed value", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { accessibleName: "a.b" } } })).toBe("Clicking on the page");
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "hunter2" } })).toBe("Typing into the page");
  });
});

describe("automationStudioActivityToolCall", () => {
  it("marks a dry run's steps as verifying and its reset as a bookkeeping note", () => {
    expect(automationStudioActivityToolCall(call("dryrun.2.6", { replay: "step", node: CLICK, parameters: { element: QUOTE }, consequences: [] }))).toEqual({
      phase: "verifying", kind: "tool", title: "Clicking “Get a free quote”", label: "Trying the Flow from the start: clicking “Get a free quote”", dryRun: true, node: CLICK
    });
    expect(automationStudioActivityToolCall(call("dryrun.2.reset", { replay: "reset", from: { location: "https://x.example" } }))).toMatchObject({ phase: "verifying", kind: "note", label: "Trying the Flow from the start" });
  });

  it("marks Core's opening call as a note, and names every other call by what it does", () => {
    expect(automationStudioActivityToolCall(call("initial.core.run_node", { node: SNAPSHOT, parameters: {}, consequences: [] }))).toMatchObject({ kind: "note", phase: "exploring", title: "Looking at the page" });
    expect(automationStudioActivityToolCall(call("nav.start", { node: NAVIGATE, parameters: { url: "https://x.example" } }))).toMatchObject({ kind: "tool", phase: "exploring", title: "Opening a page" });
    expect(automationStudioActivityToolCall(call("x", { node: "vendor.frobnicate" }))).toMatchObject({ title: "Trying a step on the page" });
    expect(automationStudioActivityToolCall(call("x", {}))).toMatchObject({ title: "Trying a step on the page" });
    expect(automationStudioActivityToolCall(call("x", {}, "vendor.tool"))).toMatchObject({ title: "Working on the page" });
    expect(automationStudioActivityToolCall(call("x", {}, "core.flow_draft"))).toMatchObject({ phase: "building", title: "Updating the draft Flow" });
  });

  it("reads an opening call that goes somewhere as going to where the Flow starts, a step of the work (F31)", () => {
    expect(automationStudioActivityToolCall(call("initial.core.run_node", { node: NAVIGATE, parameters: { url: "https://x.example" }, consequences: [] }))).toEqual({
      phase: "exploring", kind: "tool", title: "Opening where the Flow starts", label: "Opening where the Flow starts", dryRun: false, node: NAVIGATE
    });
  });
});
