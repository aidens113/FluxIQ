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

  // U-2 (`run-muw60j7c-bb7c9a62`, moment 04): a cut inside a word put "Earbuds, Hybr…" on a card.
  it("cuts a long label at the end of a word, never inside one", () => {
    const tile = "Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4";
    const cut = automationStudioActivityHumanLabel(tile, 60)!;
    expect(cut).toBe("Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybrid…");
    expect(cut.length).toBeLessThanOrEqual(60);
    expect(automationStudioActivityHumanLabel("Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds, Hybrid", 50)).toBe("Sponsored ⓘ Pulsebud Neo ANC Wireless Earbuds…");
  });
});

describe("automationStudioActivityAction", () => {
  it("names a node by the verb in its id, with the element name it already carries", () => {
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: QUOTE } })).toBe("Clicking “Get a free quote”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { target: { handle: "target.4" } } })).toBe("Clicking on the page");
    expect(automationStudioActivityAction({ id: NAVIGATE, parameters: { url: "https://shop.example/services" } })).toBe("Opening “shop.example”");
    expect(automationStudioActivityAction({ id: SNAPSHOT })).toBe("Looking over the whole page");
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list" })).toBe("Reading the list");
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "secret", element: { accessibleName: "Search" } } })).toBe("Typing into “Search”");
    expect(automationStudioActivityAction({ id: "web.detect_repeating_structure" })).toBe("Looking for the repeating list on the page");
    expect(automationStudioActivityAction({ id: "web.output.dom-wait_for_selector" })).toBe("Waiting for the page");
  });

  // t194 (`run-murwcmx2-a1c6edf7`, screenshot 00016): every step of the build's
  // test named its subject except the list read, a bare "Test run". The domain
  // names what a read reads (`describeCall`), and the sentence quotes it.
  it("names what a list read reads when the domain says it", () => {
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list", words: { target: "name and url" } })).toBe("Reading the list of “name and url”");
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list", words: {} })).toBe("Reading the list");
    expect(automationStudioActivityAction({ id: "web.output.dom-extract_list", parameters: { element: QUOTE } })).toBe("Reading the list");
    expect(automationStudioActivityToolCall(call("dryrun.1.10", { replay: "step", node: "web.output.dom-extract_list", parameters: {}, consequences: [] }), { target: "name and price" }).title).toBe("Reading the list of “name and price”");
  });

  // R2-U-8 (`run-muwansvz-a2b4a987`, moments 04-07): one list read under three
  // names -- the overlay's "name, price, rating and 3 more", the build card's
  // "name, price and 4 more" and the test card's "name and 5 more". Core names
  // a list of more than two fields by exactly two of them, for build reads and
  // test reads alike, so the overlay and the card say the same.
  it("names a list of more than two fields by two of them and how many more", () => {
    const list = "web.output.dom-extract_list";
    expect(automationStudioActivityAction({ id: list, words: { target: "name, price, rating and 3 more" } })).toBe("Reading the list of “name, price and 4 more”");
    expect(automationStudioActivityAction({ id: list, words: { target: "name, price and rating" } })).toBe("Reading the list of “name, price and rating”");
    expect(automationStudioActivityAction({ id: list, words: { target: "name and price" } })).toBe("Reading the list of “name and price”");
    expect(automationStudioActivityAction({ id: list, words: { target: "title" } })).toBe("Reading the list of “title”");
    const build = automationStudioActivityToolCall(call("rerun.5", { node: list, parameters: {} }), { target: "name, price, rating and 3 more" });
    const test = automationStudioActivityToolCall(call("dryrun.1.8", { replay: "step", node: list, parameters: {}, consequences: [] }), { target: "name, price, rating and 3 more" });
    expect(build.label).toBe("Trying again: reading the list of “name, price and 4 more”");
    expect(test.title).toBe(build.title);
  });

  it("prefers an authored label, and names nothing it does not know", () => {
    expect(automationStudioActivityAction({ id: CLICK, label: "open the services page" })).toBe("Open the services page");
    expect(automationStudioActivityAction({ id: CLICK, label: "node.bootstrap.x.y", parameters: { element: QUOTE } })).toBe("Clicking “Get a free quote”");
    expect(automationStudioActivityAction({ id: "vendor.frobnicate" })).toBeUndefined();
  });

  // t193 (`run-muqiojz4-04a7a8fc`, screenshots 00019 and 00020): the navigate
  // card read "Open page" with no page named. t174-w108 D2 (`run-musp8nz1-dbd3905a`,
  // screenshots 00008, 00012, overlay moment 7): naming it by its address path
  // put "/scenarios/crossborder-m…" in the chat and the overlay. A page is named
  // by its site, in plain words, never by a path or an address.
  it("names the page a navigate opens by its site, never its path, query or address", () => {
    const opening = (url: unknown) => automationStudioActivityAction({ id: NAVIGATE, parameters: { url } });
    expect(opening("https://www.amazon.com/s?k=usb+hub#top")).toBe("Opening “amazon.com”");
    expect(opening("https://shop.example/reset/Zx9aQ2kLm4Np7Rt1Vw3Yb6Cd/done")).toBe("Opening “shop.example”");
    expect(opening("https://SHOP.Example./")).toBe("Opening “shop.example”");
    // A page this machine serves, or one at an IP address, has no site a person
    // knows: it is the start page at the address the work starts at, and is
    // named by its path's words anywhere else (U10, below).
    const start = "http://127.0.0.1:58504/scenarios/crossborder-marketplace/";
    expect(automationStudioActivityAction({ id: NAVIGATE, parameters: { url: start }, start })).toBe("Opening the start page");
    expect(opening("http://127.0.0.1:58504/scenarios/crossborder-marketplace/")).toBe("Opening “crossborder marketplace”");
    expect(opening("http://localhost:3000/cart")).toBe("Opening “cart”");
    expect(opening("http://localhost:3000/")).toBe("Opening the home page");
    expect(opening("http://[::1]:8080/x")).toBe("Opening a page");
    expect(opening("~/")).toBe("Opening the start page");
    expect(opening("~")).toBe("Opening the start page");
    // A path with no site, or no web address at all: the verb alone.
    expect(opening("~/ip/napkins")).toBe("Opening a page");
    expect(opening("/cart?token=abc#x")).toBe("Opening a page");
    expect(opening("file:///C:/secret.txt")).toBe("Opening a page");
    expect(opening(undefined)).toBe("Opening a page");
    expect(opening("not a url at all")).toBe("Opening a page");
    for (const url of ["http://127.0.0.1:58504/scenarios/crossborder-marketplace/", "https://shop.example/ip/napkins", "~/ip/napkins"]) {
      expect(opening(url)).not.toMatch(/\/|https?:|127\.0/u);
    }
  });

  // U10 (`run-muw6144a-e56f945d`): the build's navigate to `/friends/` read
  // "Opening the start page" / "Open page · the start page", because any page
  // this machine serves read so whatever its path.
  it("names a page this machine serves as the start page only at the start address", () => {
    const start = "http://127.0.0.1:60766/scenarios/social-network-feed/";
    const opening = (url: string) => automationStudioActivityAction({ id: NAVIGATE, parameters: { url }, start });
    expect(opening("http://127.0.0.1:60766/friends/")).toBe("Opening “friends”");
    expect(opening("http://127.0.0.1:60766/scenarios/social-network-feed/friends/requests/")).toBe("Opening “requests”");
    // The start address, with or without its closing slash or a query, is the start page.
    expect(opening(start)).toBe("Opening the start page");
    expect(opening("http://127.0.0.1:60766/scenarios/social-network-feed?x=1")).toBe("Opening the start page");
    // Another port of this machine is another site.
    expect(opening("http://127.0.0.1:9999/scenarios/social-network-feed/")).toBe("Opening “social network feed”");
    // An id in the path is no name: the words before it are.
    expect(opening("http://127.0.0.1:60766/Pulsebud-Neo/dp/B0DPN4ANC7")).toBe("Opening “Pulsebud Neo”");
    // The tool call says it the same way, from the start the caller knows.
    const tool = automationStudioActivityToolCall(call("nav-friends-1", { node: NAVIGATE, parameters: { url: "http://127.0.0.1:60766/friends/" } }), undefined, { start });
    expect(tool.title).toBe("Opening “friends”");
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
    // R2-U-9: a list the page names, once the detection found it, is said by that name.
    expect(automationStudioActivityAction({ id: "web.detect_repeating_structure", words: { target: "Paper towels", list: "Search results" } })).toBe("Looking for the list “Search results”");
    expect(automationStudioActivityAction({ id: SNAPSHOT })).not.toBe("Looking at the page");
  });

  // t174-w108 D5 (`run-musp8nz1-dbd3905a`, screenshots 00010, 00014): the
  // quantity field's step carried `element.label: "Quantity"` and its card read
  // "Type · Done", naming no field. A field's own label names it first: the
  // search box's accessible name was its placeholder, "Autumn Mega Sale…".
  it("names the field a typing step types into by its label, then its accessible name", () => {
    const quantity = { tagName: "input", selector: "main > div > input", label: "Quantity" };
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "3", submit: false, element: quantity } })).toBe("Typing into “Quantity”");
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { text: "3", element: quantity }, words: { text: "3" } })).toBe('Typing "3" into “Quantity”');
    expect(automationStudioActivityAction({ id: "web.output.dom-type", parameters: { element: { label: "Search", accessibleName: "Autumn Mega Sale: up to 70% off" } } })).toBe("Typing into “Search”");
    expect(automationStudioActivityAction({ id: CLICK, parameters: { element: { label: "a.b", accessibleName: "Add to cart" } } })).toBe("Clicking “Add to cart”");
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
    expect(automationStudioActivityToolCall(call("nav.start", { node: NAVIGATE, parameters: { url: "https://x.example" } }))).toMatchObject({ kind: "tool", phase: "exploring", title: "Opening “x.example”" });
    expect(automationStudioActivityToolCall(call("x", { node: "vendor.frobnicate" }))).toMatchObject({ title: "Running the “Frobnicate” step" });
    expect(automationStudioActivityToolCall(call("x", {}))).toMatchObject({ title: "Running a step" });
    expect(automationStudioActivityToolCall(call("x", {}, "vendor.recall_notes"))).toMatchObject({ title: "Using “Recall notes”" });
    expect(automationStudioActivityToolCall(call("x", {}, "core.flow_draft"))).toMatchObject({ phase: "building", title: "Changing the Flow" });
  });

  it("says what Core's own look-ups read (t193: they read Working on the page)", () => {
    // R2-U-4 (`run-muwansvz-a2b4a987`, moment 04): "Looking up how to use
    // “Extract list”" put a node's name on the card ("Look · Extract list");
    // a look-up says what it looks up, in a person's words, naming no node.
    expect(automationStudioActivityToolCall(call("d1", { ids: ["web.output.dom-type"] }, "core.describe_nodes"))).toMatchObject({ kind: "tool", phase: "exploring", title: "Looking up how to type" });
    expect(automationStudioActivityToolCall(call("d0", { ids: ["web.output.dom-extract_list"] }, "core.describe_nodes")).title).toBe("Looking up how to read a list");
    expect(automationStudioActivityToolCall(call("d2", { ids: ["web.output.dom-type", "web.output.dom-click", "web.output.dom-extract-list", "builtin.control.merge"] }, "core.describe_nodes")).title)
      .toBe("Looking up how to type, click, read a list and more");
    expect(automationStudioActivityToolCall(call("d3", { ids: ["web.output.dom-click", "web.output.dom-type"] }, "core.describe_nodes")).title).toBe("Looking up how to click and type");
    expect(automationStudioActivityToolCall(call("d5", { ids: ["builtin.control.merge"] }, "core.describe_nodes")).title).toBe("Looking up how to use a step");
    expect(automationStudioActivityToolCall(call("d4", {}, "core.describe_nodes")).title).toBe("Looking up how to use a step");
    expect(automationStudioActivityToolCall(call("r1", { callId: "open-store-picker-1" }, "core.recall_result")).title).toBe("Looking again at what “open store picker 1” found");
    expect(automationStudioActivityToolCall(call("r2", { callId: "initial.core.run_node" }, "core.recall_result")).title).toBe("Looking again at what an earlier step found");
  });

  it("says which part of the Flow a part run runs, with no step number (t244, t195)", () => {
    expect(automationStudioActivityToolCall(call("p1", { from: 3, to: 5 }, "core.run_flow"))).toMatchObject({ kind: "tool", phase: "exploring", title: "Running part of the Flow", dryRun: false });
    expect(automationStudioActivityToolCall(call("p2", { from: 3 }, "core.run_flow")).title).toBe("Running the rest of the Flow");
    expect(automationStudioActivityToolCall(call("p5", { from: 1 }, "core.run_flow")).title).toBe("Running the Flow from its start");
    expect(automationStudioActivityToolCall(call("p3", { from: 4, to: 4 }, "core.run_flow")).title).toBe("Running one step of the Flow");
    expect(automationStudioActivityToolCall(call("p4", {}, "core.run_flow")).title).toBe("Running part of the Flow");
  });

  // t244: the steps a part run sends carry the replay key, as a dry run's do, under
  // the model's own call id; they are part of a test, never exploring.
  it("marks the steps a part run sends as trying part of the Flow", () => {
    expect(automationStudioActivityToolCall(call("p1.3", { replay: "step", node: CLICK, parameters: { element: QUOTE }, consequences: [] }))).toEqual({
      phase: "verifying", kind: "tool", title: "Clicking “Get a free quote”", label: "Trying part of the Flow: clicking “Get a free quote”", dryRun: true, node: CLICK
    });
    expect(automationStudioActivityToolCall(call("p1.4", { replay: "verify", node: CLICK, parameters: { element: QUOTE } }))).toMatchObject({ phase: "verifying", label: "Trying part of the Flow: clicking “Get a free quote”", dryRun: true });
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
