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
    expect(automationStudioActivityAction({ id: NAVIGATE, parameters: { url: "https://shop.example/services" } })).toBe("Opening “/services”");
    expect(automationStudioActivityAction({ id: SNAPSHOT })).toBe("Looking over the whole page");
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list" })).toBe("Reading the list");
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "secret", element: { accessibleName: "Search" } } })).toBe("Typing into “Search”");
    expect(automationStudioActivityAction({ id: "web.detect_repeating_structure" })).toBe("Looking for the repeating list on the page");
    expect(automationStudioActivityAction({ id: "web.output.dom-wait_for_selector" })).toBe("Waiting for the page");
  });

  it("prefers an authored label, and names nothing it does not know", () => {
    expect(automationStudioActivityAction({ id: CLICK, label: "open the services page" })).toBe("Open the services page");
    expect(automationStudioActivityAction({ id: CLICK, label: "node.bootstrap.x.y", parameters: { element: QUOTE } })).toBe("Clicking “Get a free quote”");
    expect(automationStudioActivityAction({ id: "vendor.frobnicate" })).toBeUndefined();
  });

  // t193 (`run-muqiojz4-04a7a8fc`, screenshots 00019 and 00020): the navigate
  // card read "Open page" with no page named.
  it("names the page a navigate opens by its address path, or as the home page, never its query", () => {
    const opening = (url: unknown) => automationStudioActivityAction({ id: NAVIGATE, parameters: { url } });
    expect(opening("http://127.0.0.1:63414/scenarios/bigbox-retail/ip/valueridge-everyday-dinner-napkins/418831402?variant=5530102"))
      .toBe("Opening “…/ip/valueridge-everyday-dinner-napkins/418831402”");
    expect(opening("https://shop.example/")).toBe("Opening “Home page”");
    expect(opening("~/")).toBe("Opening “Home page”");
    expect(opening("~/ip/napkins")).toBe("Opening “/ip/napkins”");
    expect(opening("/cart?token=abc#x")).toBe("Opening “/cart”");
    expect(opening("https://shop.example/reset/Zx9aQ2kLm4Np7Rt1Vw3Yb6Cd/done")).toBe("Opening “/reset/…/done”");
    expect(opening("https://shop.example/caf%C3%A9")).toBe("Opening “/café”");
    expect(opening(undefined)).toBe("Opening a page");
    expect(opening("not a url at all")).toBe("Opening a page");
  });

  // F36 (`run-muqiho5c-e830ce01`): a control with no accessible name read "Click · the page" in the playback.
  it("names an element by its visible text when it has no accessible name, the name first when it has both", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { tagName: "div", visibleText: "Not now" } } })).toBe("Clicking “Not now”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { accessibleName: "Space Grey", visibleText: "Grey" } } })).toBe("Clicking “Space Grey”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { visibleText: "a.b" } } })).toBe("Clicking on the page");
  });

  it("names an element by the words it shows when it has no accessible name (t193: dry-run cards read a bare Test run)", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { tagName: "span", visibleText: "+" } } })).toBe("Clicking “+”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { tagName: "div", visibleText: "12 Double Rolls$16.47" } } })).toBe("Clicking “12 Double Rolls$16.47”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { accessibleName: "Close", visibleText: "×" } } })).toBe("Clicking “Close”");
  });

  it("says what a look inspects: a control's details, a list around a control, or the whole page", () => {
    expect(automationStudioActivityAction({ id: "web.describe_element", words: { target: "Add to cart" } })).toBe("Reading the details of “Add to cart”");
    expect(automationStudioActivityAction({ id: "web.recovery.describe_element" })).toBe("Reading the details of a control");
    expect(automationStudioActivityAction({ id: "web.detect_repeating_structure", words: { target: "Paper towels" } })).toBe("Looking for the repeating list around “Paper towels”");
    expect(automationStudioActivityAction({ id: SNAPSHOT })).not.toBe("Looking at the page");
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
    expect(automationStudioActivityToolCall(call("initial.core.run_node", { node: SNAPSHOT, parameters: {}, consequences: [] }))).toMatchObject({ kind: "note", phase: "exploring", title: "Looking over the page the Flow starts on" });
    expect(automationStudioActivityToolCall(call("nav.start", { node: NAVIGATE, parameters: { url: "https://x.example" } }))).toMatchObject({ kind: "tool", phase: "exploring", title: "Opening “Home page”" });
    expect(automationStudioActivityToolCall(call("x", { node: "vendor.frobnicate" }))).toMatchObject({ title: "Running the “Frobnicate” step" });
    expect(automationStudioActivityToolCall(call("x", {}))).toMatchObject({ title: "Running a step" });
    expect(automationStudioActivityToolCall(call("x", {}, "vendor.recall_notes"))).toMatchObject({ title: "Using “Recall notes”" });
    expect(automationStudioActivityToolCall(call("x", {}, "core.flow_draft"))).toMatchObject({ phase: "building", title: "Updating the draft Flow" });
  });

  it("says what Core's own look-ups read (t193: they read Working on the page)", () => {
    expect(automationStudioActivityToolCall(call("d1", { ids: ["web.output.dom-type"] }, "core.describe_nodes"))).toMatchObject({ kind: "tool", phase: "exploring", title: "Looking up how to use “Type”" });
    expect(automationStudioActivityToolCall(call("d2", { ids: ["web.output.dom-type", "web.output.dom-click", "web.output.dom-extract-list", "builtin.control.merge"] }, "core.describe_nodes")).title)
      .toBe("Looking up how to use “Type, Click, Extract list and 1 more”");
    expect(automationStudioActivityToolCall(call("d3", { ids: ["web.output.dom-click", "web.output.dom-type"] }, "core.describe_nodes")).title).toBe("Looking up how to use “Click and Type”");
    expect(automationStudioActivityToolCall(call("d4", {}, "core.describe_nodes")).title).toBe("Looking up how to use a step");
    expect(automationStudioActivityToolCall(call("r1", { callId: "open-store-picker-1" }, "core.recall_result")).title).toBe("Looking again at what “open store picker 1” found");
    expect(automationStudioActivityToolCall(call("r2", { callId: "initial.core.run_node" }, "core.recall_result")).title).toBe("Looking again at what an earlier step found");
  });

  // A rerun's words name no step number (t195, `run-murdouox-c5294247`: the
  // overlay read "Trying step 12 again", a number the person never sees).
  it("says a rerun's reset as bookkeeping for its step, and the rerun as tried again, with no step number (t193: Action · the page)", () => {
    expect(automationStudioActivityToolCall(call("rerun.10.place", { replay: "reset", from: { location: "https://x.example/p" } }))).toEqual({
      phase: "exploring", kind: "note", title: "Putting the page back to where the step starts", label: "Putting the page back to where the step starts", dryRun: false
    });
    expect(automationStudioActivityToolCall(call("rerun.10", { node: CLICK, parameters: { element: QUOTE } }))).toEqual({
      phase: "exploring", kind: "tool", title: "Clicking “Get a free quote”", label: "Trying again: clicking “Get a free quote”", dryRun: false, node: CLICK
    });
  });

  // t193 W1: after a rerun's reset, the steps before it on the same page are
  // done again (`../../../llm/node-tools/step-place.ts`); each is its own call,
  // `rerun.<n>[.<k>].place.<m>`, and read as the rerun itself.
  it("says a step done again before a rerun as an earlier step, and a checked one as checked, never as the rerun itself", () => {
    expect(automationStudioActivityToolCall(call("rerun.10.2.place.9", { replay: "step", node: CLICK, parameters: { element: { tagName: "span", visibleText: "+" } } }))).toEqual({
      phase: "exploring", kind: "tool", title: "Clicking “+”", label: "Doing an earlier step again first: clicking “+”", dryRun: false, node: CLICK
    });
    expect(automationStudioActivityToolCall(call("rerun.12.place.11", { replay: "verify", node: CLICK, parameters: { element: { accessibleName: "Add to cart" } } }))).toEqual({
      phase: "exploring", kind: "tool", title: "Clicking “Add to cart”", label: "Checking an earlier step is still done: clicking “Add to cart”", dryRun: false, node: CLICK
    });
    expect(automationStudioActivityToolCall(call("rerun.10.2.place", { replay: "reset", from: { location: "https://x.example/p" } })).title).toBe("Putting the page back to where the step starts");
    for (const callId of ["rerun.10", "rerun.10.2.place", "rerun.10.2.place.9", "rerun.12.place.11"]) {
      expect(automationStudioActivityToolCall(call(callId, { replay: "step", node: CLICK, parameters: { element: QUOTE } })).label).not.toMatch(/step \d/u);
    }
  });

  it("reads an opening call that goes somewhere as going to where the Flow starts, a step of the work (F31)", () => {
    expect(automationStudioActivityToolCall(call("initial.core.run_node", { node: NAVIGATE, parameters: { url: "https://x.example" }, consequences: [] }))).toEqual({
      phase: "exploring", kind: "tool", title: "Opening where the Flow starts", label: "Opening where the Flow starts", dryRun: false, node: NAVIGATE
    });
  });
});
