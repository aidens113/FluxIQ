import { describe, expect, it } from "vitest";
import { automationStudioScreenedNodeParameters } from "../parameter-screen.ts";

// The screen exists so a repair can be shown what a step did without being
// shown what the person's data was. Both halves are assertions here: what it
// carries is as much the contract as what it refuses, because a screen that
// keeps nothing is a screen nobody will use.

const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;

const screen = (parameters: Record<string, unknown>) =>
  automationStudioScreenedNodeParameters(parameters as never, [...DENIED]);

describe("automationStudioScreenedNodeParameters", () => {
  it("carries numbers and booleans whole: a timeout and a row minimum say what the step did and name nobody", () => {
    expect(screen({ timeoutMs: 10_000, paginate: false, minItems: 0 }).values)
      .toEqual({ timeoutMs: 10_000, paginate: false, minItems: 0 });
  });

  it("drops a key the domain denies and Core's own target family, and names both", () => {
    const screened = screen({ selector: "#pay-now", target: "target.7", targetNodeId: "node.2", label: "Pay now" });
    expect(screened.values).toEqual({ label: "Pay now" });
    expect(screened.withheld).toEqual(["selector", "target", "targetNodeId"]);
  });

  it("carries a control's name and never the text a person typed into it", () => {
    const screened = screen({ accessibleName: "Search", role: "textbox", text: "aiden@example.com", value: "4111 1111 1111 1111" });
    expect(screened.values).toEqual({ accessibleName: "Search", role: "textbox", text: null, value: null });
    expect(screened.withheld).toEqual(["text", "value"]);
  });

  it("carries a URL as its origin, never its path or its query", () => {
    expect(screen({ url: "https://shop.example.com/search?q=plus&session=9f2c" }).values).toEqual({ url: "https://shop.example.com" });
    // An authority with userinfo in it is refused rather than trimmed: what
    // would be trimmed off is a credential.
    const withUserinfo = screen({ url: "https://user:pass@shop.example.com/cart" });
    expect(withUserinfo.values).toEqual({ url: null });
    expect(withUserinfo.withheld).toEqual(["url"]);
    // A relative path is ordinary text and falls to the key rule.
    expect(screen({ url: "/checkout/confirm" }).values).toEqual({ url: null });
  });

  it("refuses a credential wherever it sits, whatever its key is called", () => {
    const screened = screen({ label: "sk-live-9f2c7a1b3d5e8f0a4c6b", note: { name: "ghp_0123456789abcdefghijklmnopqrstuvwxyz" } });
    expect(JSON.stringify(screened.values)).not.toContain("sk-live");
    expect(JSON.stringify(screened.values)).not.toContain("ghp_");
    expect(screened.withheld).toEqual(["label", "note.name"]);
  });

  it("refuses a name that is really a way to address an element", () => {
    // `name` is one of Core's name keys, so only the locator screen stands
    // between this and the request.
    const screened = screen({ name: 'button[data-testid="pay"]' });
    expect(screened.values).toEqual({ name: null });
    expect(screened.withheld).toEqual(["name"]);
  });

  it("keeps an object's keys when it cannot keep its values, so the shape survives", () => {
    // The field map of an extraction: the keys are the columns it asked the
    // page for, which is the thing a wrong-answer repair needs, and the values
    // are the page's own field names, which it does not.
    const screened = screen({ extractList: { handle: "listings-abc123", fields: { name: "productTitle", price: "priceText" }, minItems: 0 } });
    expect(screened.values).toEqual({ extractList: { handle: null, fields: { name: null, price: null }, minItems: 0 } });
    expect(screened.withheld).toEqual(["extractList.handle", "extractList.fields.name", "extractList.fields.price"]);
  });

  it("reads a name key as Core's vocabulary only where the keys are the definition's, not the author's", () => {
    // `name` one level in is a node parameter's field and is carried; `name`
    // three levels in is a column the author invented, and reading it as Core's
    // word would carry one column's page field and withhold the next one's for
    // no reason a reader could state.
    expect(screen({ element: { name: "Add to cart" } }).values).toEqual({ element: { name: "Add to cart" } });
    expect(screen({ extractList: { fields: { name: "productTitle" } } }).values).toEqual({ extractList: { fields: { name: null } } });
  });

  it("carries an array's length and stops at its own depth, saying where it stopped", () => {
    const screened = screen({ where: [{ field: "badge", is: "absent" }, { field: "price", atMost: 50 }] });
    expect(screened.values).toEqual({ where: { count: 2, items: [{ field: "badge", is: "absent" }, { field: "price", atMost: 50 }] } });
    const deep = screen({ a: { b: { c: { d: { e: 1 } } } } });
    expect(deep.values).toEqual({ a: { b: { c: { d: null } } } });
    expect(deep.withheld).toEqual(["a.b.c.d"]);
  });

  it("denies a key however it is spelled, because Core compares keys with separators removed", () => {
    expect(screen({ page_source: "<html>", "Inner-Html": "<td>" }).withheld).toEqual(["page_source", "Inner-Html"]);
  });
});
