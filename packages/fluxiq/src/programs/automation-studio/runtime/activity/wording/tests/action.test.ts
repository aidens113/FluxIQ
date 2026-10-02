import { describe, expect, it } from "vitest";
import { activityActionOf, activityActionVerb } from "../../../../../../ui/index.ts";
import { automationStudioActivityAction } from "../index.ts";

// The wording recognizes verbs through the chat's action kinds, and a card
// reads a step's verb back from the sentence the wording said. These hold the
// two together: every sentence opens with the word the card reads it by.
const IDS = [
  "web.output.navigate", "web.output.back", "web.output.dom-click", "web.output.fill", "web.output.clear", "web.output.select",
  "web.output.check", "web.output.upload", "web.output.extract", "web.output.detect", "web.output.inspect", "web.output.scroll",
  "web.output.wait", "web.output.assert", "web.output.download", "web.output.keypress", "web.output.dialog", "web.output.tab"
];

describe("automationStudioActivityAction and the chat's action kinds", () => {
  it.each(IDS)("says %s in a sentence a card reads back as the same kind", (id) => {
    const title = automationStudioActivityAction({ id });
    expect(title).toBeDefined();
    const word = (id.split(".").at(-1) ?? "").split("-").at(-1) ?? "";
    const expected = activityActionVerb(word)?.kind;
    const card = activityActionOf({ phase: "running", step: { nodeId: "n1" }, detail: { kind: "step", title: title!, status: "started", ref: "n1" } });
    expect(card?.kind).toBe(expected);
  });

  it("passes over a verb it has no sentence for, as it does an unknown word", () => {
    expect(automationStudioActivityAction({ id: "web.output.list" })).toBeUndefined();
    expect(automationStudioActivityAction({ id: "web.output.list-extract" })).toBe("Reading from the page");
  });

  it("reads the words of the shared table", () => {
    expect(automationStudioActivityAction({ id: "web.output.nav" })).toBe("Opening a page");
  });
});

// Every chat step says what it does (user rule: the chat shows every step with its reasoning).
// "Looking at the page" and "Working on the page" stood for every find and every press of the
// crossborder build (run-muqc07fh-eeffbc86); the domain's words for a call name the control a
// handle stands for and the words a call types or looks for.
describe("a call the bound domain describes", () => {
  const card = (title: string) => activityActionOf({ phase: "exploring", detail: { kind: "tool", title, status: "started", ref: "core.run_node" } });

  it("says the words a find on the page looks for", () => {
    const title = automationStudioActivityAction({ id: "web.find_on_page", words: { text: "Voltbay" } });
    expect(title).toBe('Looking for "Voltbay" on the page');
    expect(card(title!)?.kind).toBe("look");
    expect(automationStudioActivityAction({ id: "web.find_on_page" })).toBe("Looking over the whole page");
    expect(automationStudioActivityAction({ id: "web.output.search", words: { text: "towels" } })).toBe('Searching the page for "towels"');
  });

  it("says what is typed and into which field, and the card names the field, not the words", () => {
    const title = automationStudioActivityAction({ id: "web.output.dom-type", words: { target: "Search", text: "USB-C  hub" } });
    expect(title).toBe('Typing "USB-C hub" into “Search”');
    expect(card(title!)).toMatchObject({ kind: "type", target: "Search" });
    expect(automationStudioActivityAction({ id: "web.output.dom-type", words: { text: "towels" } })).toBe('Typing "towels"');
    expect(automationStudioActivityAction({ id: "web.output.dom-type", words: { target: "Search" } })).toBe("Typing into “Search”");
  });

  it("names a find's card by the words it looks for, in quotes, never as a control", () => {
    const title = automationStudioActivityAction({ id: "web.find_on_page", words: { text: "Colour" } })!;
    expect(card(title)).toMatchObject({ kind: "look", target: '"Colour"' });
  });

  it("names the control whose details are read, on the card too", () => {
    const title = automationStudioActivityAction({ id: "web.describe_element", words: { target: "Colour" } })!;
    expect(title).toBe("Reading the details of “Colour”");
    expect(activityActionOf({ phase: "exploring", detail: { kind: "tool", title, status: "started", ref: "web.describe_element" } })).toMatchObject({ kind: "look", target: "Colour" });
  });

  it("says which control a press is on", () => {
    const title = automationStudioActivityAction({ id: "web.output.dom-click", words: { target: "Add to cart" } });
    expect(title).toBe("Clicking “Add to cart”");
    expect(card(title!)).toMatchObject({ kind: "click", target: "Add to cart" });
  });

  it("bounds what it quotes, and never breaks its own quotes", () => {
    const title = automationStudioActivityAction({ id: "web.output.dom-type", words: { text: `say "hi" ${"x".repeat(80)}` } });
    expect(title).toMatch(/^Typing "say 'hi' x+…"$/u);
  });
});

// t174/w62: a sometimes-present step (a popup, a banner) the run skipped
// because what it acts on was not on the page. Skipped, never failed.
describe("automationStudioActivityAction for a step skipped because it was not shown", () => {
  it("names the control first, then the authored label, else says a step", () => {
    const element = { element: { accessibleName: "Close dialog", visibleText: "×" } };
    expect(automationStudioActivityAction({ id: "web.output.dom-click", parameters: element, label: "Dismiss the offer", notShown: true })).toBe("Skipped “Close dialog”: it was not shown");
    expect(automationStudioActivityAction({ id: "web.output.dom-click", words: { target: "Not now" }, notShown: true })).toBe("Skipped “Not now”: it was not shown");
    expect(automationStudioActivityAction({ id: "web.output.dom-click", label: "Dismiss the offer", notShown: true })).toBe("Skipped “Dismiss the offer”: what it acts on was not shown");
    expect(automationStudioActivityAction({ id: "vendor.frobnicate", notShown: true })).toBe("Skipped a step: what it acts on was not shown");
  });

  it("never names a control by an id, and a card reads it as done, not failed", () => {
    const title = automationStudioActivityAction({ id: "web.output.dom-click", parameters: { element: { accessibleName: "a.b" } }, notShown: true })!;
    expect(title).toBe("Skipped a step: what it acts on was not shown");
    const card = activityActionOf({ phase: "running", step: { nodeId: "n1" }, detail: { kind: "step", title, status: "succeeded", ref: "n1" } });
    expect(card?.outcome).toBe("done");
    expect(card?.why ?? null).toBeNull();
  });

  it("says what the step does when notShown is not set", () => {
    expect(automationStudioActivityAction({ id: "web.output.dom-click", label: "Dismiss the offer", notShown: false })).toBe("Dismiss the offer");
  });
});
