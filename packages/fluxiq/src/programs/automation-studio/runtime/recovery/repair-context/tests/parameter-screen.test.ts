import { describe, expect, it } from "vitest";
import { automationStudioScreenedNodeParameters } from "../parameter-screen.ts";

// The screen exists so a repair is shown everything a step was authored with
// except what must never travel: a credential, a value under a key that names a
// secret, a key the domain denies or Core's own target family, and a string
// shaped like a locator. Both halves are assertions here, and since 2026-09-30
// ("the model sees the whole page") the carrying half is everything else:
// no vocabulary, no depth, key, item or length cap, no URL reduction.

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

  it("carries a 500-character value and a full URL with its path and query", () => {
    const long = "Wireless earbuds rated four stars or more, ".repeat(12).slice(0, 500);
    const screened = screen({ label: long, url: "https://shop.example.com/search?q=plus&page=2", newTab: false });
    expect(long).toHaveLength(500);
    expect(screened.values).toEqual({ label: long, url: "https://shop.example.com/search?q=plus&page=2", newTab: false });
    expect(screened.withheld).toEqual([]);
    const loopback = screen({ url: "http://127.0.0.1:41235/search?k=earbuds" });
    expect(loopback.values).toEqual({ url: "http://127.0.0.1:41235/search?k=earbuds" });
  });

  it("withholds a value under a secret-named key, whatever it looks like, and keeps the key", () => {
    const screened = screen({ password: "hunter2", pinCode: "4821", apiKey: "abc", cardNumber: "4111 1111 1111 1111", cvv: "123", otp: "999999", authToken: { raw: "x" }, username: "aiden" });
    expect(screened.values).toEqual({ password: null, pinCode: null, apiKey: null, cardNumber: null, cvv: null, otp: null, authToken: null, username: "aiden" });
    expect(screened.withheld).toEqual(["password", "pinCode", "apiKey", "cardNumber", "cvv", "otp", "authToken"]);
    expect(JSON.stringify(screened.values)).not.toMatch(/hunter2|4821|4111/);
    // Words, not substrings: an author, a keyword and a shipping option are not secrets.
    expect(screen({ author: "Ann", keyword: "earbuds", shippingMethod: "express" }).values)
      .toEqual({ author: "Ann", keyword: "earbuds", shippingMethod: "express" });
  });

  it("withholds a URL carrying userinfo or a secret-named query parameter, and nothing else about URLs", () => {
    const withUserinfo = screen({ url: "https://user:pass@shop.example.com/cart" });
    expect(withUserinfo.values).toEqual({ url: null });
    expect(withUserinfo.withheld).toEqual(["url"]);
    const withToken = screen({ url: "https://shop.example.com/cart?session_token=9f2c&item=3" });
    expect(withToken.values).toEqual({ url: null });
    expect(withToken.withheld).toEqual(["url"]);
    expect(screen({ url: "/checkout/confirm" }).values).toEqual({ url: "/checkout/confirm" });
  });

  it("refuses a credential wherever it sits, whatever its key is called", () => {
    const screened = screen({ label: "sk-live-9f2c7a1b3d5e8f0a4c6b", note: { name: "ghp_0123456789abcdefghijklmnopqrstuvwxyz" } });
    expect(JSON.stringify(screened.values)).not.toContain("sk-live");
    expect(JSON.stringify(screened.values)).not.toContain("ghp_");
    expect(screened.withheld).toEqual(["label", "note.name"]);
  });

  it("refuses a value that is really a way to address an element", () => {
    const screened = screen({ name: 'button[data-testid="pay"]', item: ".product-card" });
    expect(screened.values).toEqual({ name: null, item: null });
    expect(screened.withheld).toEqual(["name", "item"]);
  });

  it("carries an extraction whole: every column, every condition, every comparand and the page's own field names", () => {
    const screened = screen({
      extractList: {
        handle: "listings-abc123",
        fields: { name: "productTitle", price: { kind: "number", handling: "exclude" } },
        where: [{ read: "column:Badge", is: "absent" }, { field: "badge", contains: ["Sold out", "Backorder"], not: true }],
        paginate: { mode: "next-link" },
        minItems: 1
      }
    });
    expect(screened.values).toEqual({
      extractList: {
        handle: "listings-abc123",
        fields: { name: "productTitle", price: { kind: "number", handling: "exclude" } },
        where: { count: 2, items: [{ read: "column:Badge", is: "absent" }, { field: "badge", contains: { count: 2, items: ["Sold out", "Backorder"] }, not: true }] },
        paginate: { mode: "next-link" },
        minItems: 1
      }
    });
    expect(screened.withheld).toEqual([]);
  });

  it("carries what a typing step sent and what a condition expected, unless a screen says otherwise", () => {
    expect(screen({ element: { accessibleName: "Email" }, text: "aiden@example.com" }).values)
      .toEqual({ element: { accessibleName: "Email" }, text: "aiden@example.com" });
    const screened = screen({ expectedState: { conditions: [{ signalPath: "page.url", operator: "contains", expected: "/plus" }, { kind: "text-present", expected: "sk-live-9f2c7a1b3d5e8f0a4c6b" }] } });
    expect(screened.values).toEqual({
      expectedState: { conditions: { count: 2, items: [{ signalPath: "page.url", operator: "contains", expected: "/plus" }, { kind: "text-present", expected: null }] } }
    });
    expect(screened.withheld).toEqual(["expectedState.conditions.1.expected"]);
  });

  it("carries every key, every item and every level, with no count, length or depth cap", () => {
    const wide = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, `value ${index}`]));
    const list = Array.from({ length: 30 }, (_, index) => `item ${index}`);
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    const screened = screen({ wide, list, deep });
    expect(screened.values).toEqual({ wide, list: { count: 30, items: list }, deep });
    expect(screened.withheld).toEqual([]);
  });

  it("names every withheld path, however many there are", () => {
    const secrets = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`password${index}`, "x"]));
    expect(screen(secrets).withheld).toHaveLength(30);
  });

  it("denies a key however it is spelled, because Core compares keys with separators removed", () => {
    expect(screen({ page_source: "<html>", "Inner-Html": "<td>" }).withheld).toEqual(["page_source", "Inner-Html"]);
  });
});
