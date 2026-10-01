import { describe, expect, it } from "vitest";
import { automationStudioLocatorShapedText, automationStudioWithoutLocators } from "../../../llm/harness/index.ts";
import { automationStudioScreenedNodeParameters } from "../parameter-screen.ts";

// How a withheld parameter is *named*, as opposed to which values are carried.
//
// `parameter-screen.test.ts` beside this file asserts what the screen keeps and
// what it refuses. This one asserts that the record of a refusal survives the
// journey out, which turned out to be a separate question with a separate
// answer: the list travels inside a section, so it passes the whole-context
// locator screen with every other string in the request, and a path through a
// bracketed list index *is* locator-shaped -- a `.` after a `]` satisfies the
// class-selector shape. Every name this screen minted through a list was
// therefore replaced on its way to the model, and the extraction parameters
// whose comparands legitimately stay withheld are made almost entirely of list
// paths, so the names that mattered most were the ones that never arrived.
//
// The cases here read the real screen rather than describing it, because the
// claim is about what two modules do to one string and only a test that calls
// both can hold it. They sit in their own file because the notation is its own
// decision, and because keeping them in the sibling took that file past the
// audit's 400-line advisory.

const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;

const screen = (parameters: Record<string, unknown>) =>
  automationStudioScreenedNodeParameters(parameters as never, [...DENIED]);

describe("the notation a withheld parameter is named in", () => {
  it("names a path through a list as itself, in a notation the locator screen leaves standing", () => {
    // The shape live run `run-muhubegx-9469de5e` authored: an extraction filtered
    // by a regex over one column it read. The pattern escapes a dot, which is
    // locator-shaped, so the comparand stays withheld and the only thing the
    // repair gets about it is its *name* -- and that name travels inside a section
    // through the whole-context locator screen to get there.
    const screened = screen({ extractList: { where: [{ read: "price", matches: ["\\.price-text"] }] } });
    expect(screened.values).toEqual({ extractList: { where: { count: 1, items: [{ read: "price", matches: { count: 1 } }] } } });
    expect(screened.withheld).toEqual(["extractList.where.0.matches.0"]);
    // Every path this screen mints survives that screen as itself, measured
    // against the real function rather than described.
    for (const path of screened.withheld) {
      expect(automationStudioLocatorShapedText(path), path).toBe(false);
      expect(automationStudioWithoutLocators(path)).toBe(path);
    }
    // And the same position spelled with a bracketed index does not survive it,
    // which is the defect this notation exists to avoid. It is not even lost
    // cleanly: what arrives is a fabricated path that names no parameter and
    // reads as though a selector had been withheld rather than a comparand.
    expect(automationStudioWithoutLocators("extractList.where[0].matches[0]")).toBe("extractList.where[0][locator withheld][0]");
    expect(automationStudioWithoutLocators("extractList.where[0].read")).toBe("extractList.where[0][locator withheld]");
  });

  it("mints no path the locator screen would touch, at every level it reaches", () => {
    // The claim is about the notation rather than about one fixture, so this
    // walks a parameter tree with lists at three levels and a refusal of each
    // kind -- credential, locator, secret-named key, denied key -- and
    // asserts the property over whatever set of paths comes back.
    const screened = screen({
      extractList: {
        fields: { name: "productTitle", price: { kind: "text", handling: "exclude" } },
        where: [
          { read: "price", matches: ["\\.price-text"] },
          { read: "note", contains: ["bearer 9f2c7a1b3d5e8f0a4c6b1e2d"] },
          { read: "title", equals: ["x".repeat(81)] }
        ]
      },
      conditions: [{ signalPath: "page.url", operator: "contains", expected: "/plus" }],
      value: ["4111 1111 1111 1111"],
      password: "hunter2",
      "pin-code": ["1234"],
      selector: "#pay-now"
    });
    expect(screened.withheld.length).toBeGreaterThanOrEqual(5);
    for (const path of screened.withheld) {
      expect(automationStudioLocatorShapedText(path), path).toBe(false);
      expect(automationStudioWithoutLocators(path)).toBe(path);
    }
    // A path through an author's *own* locator-shaped key is still caught, and
    // that is the screen doing its job rather than mangling a name: the segment
    // is a string an author wrote, not punctuation Core minted, so no exemption
    // for "a path Core minted" could have been written that did not carry it.
    const authored = screen({ extractList: { fields: { "#confirm": { kind: "text" } } } });
    expect(authored.values).toEqual({ extractList: { fields: { "#confirm": { kind: "text" } } } });
    expect(automationStudioWithoutLocators("extractList.fields.#confirm.kind")).toBe("[locator withheld]");
  });

  it("still refuses a locator in a value, and leaves the screen that redacts one exactly as strict", () => {
    // Nothing about what a *value* may be moved. A string shaped like a way to
    // address an element is refused here whatever key it sits under, including
    // the two naming keys most likely to hold one by accident, and the screen
    // still replaces a locator inside text a section carries whole.
    const screened = screen({ label: "#pay-now", accessibleName: "div.row-selected > .price", role: "button" });
    expect(screened.values).toEqual({ label: null, accessibleName: null, role: "button" });
    expect(screened.withheld).toEqual(["label", "accessibleName"]);
    expect(automationStudioWithoutLocators('an element matching selector [data-testid="pay"]'))
      .toBe("an element matching selector [locator withheld]");
  });
});
