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

  it("carries a URL as its origin, never its path or its query, and says that it did", () => {
    const reduced = screen({ url: "https://shop.example.com/search?q=plus&session=9f2c" });
    expect(reduced.values).toEqual({ url: "https://shop.example.com" });
    // The origin stands in `values` and the path is named in `withheld`, which
    // together say "this origin, and there was more after it". Without the
    // second, a navigation to `/search?q=plus` and one to the site's root are
    // the same record, and the empty list asserts nothing was touched.
    expect(reduced.withheld).toEqual(["url"]);
    // A bare origin is not named, because nothing was dropped from it -- which
    // is what makes the two cases tellable apart at all.
    const bare = screen({ url: "https://shop.example.com" });
    expect(bare.values).toEqual({ url: "https://shop.example.com" });
    expect(bare.withheld).toEqual([]);
    expect(screen({ url: "https://shop.example.com/" }).withheld).toEqual([]);
    // The shape every live run actually writes: a loopback fixture with a port
    // and a query. Ten attempts on one scenario read alike until this was named.
    const loopback = screen({ url: "http://127.0.0.1:41235/search?k=earbuds", newTab: false });
    expect(loopback.values).toEqual({ url: "http://127.0.0.1:41235", newTab: false });
    expect(loopback.withheld).toEqual(["url"]);
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

  it("carries an extraction's own vocabulary: what each condition read, what it compared, and what each column reads", () => {
    // The run that made this necessary stored 43 rows where 13 were asked for,
    // and its re-author was shown `where: { items: [{ read: null, is: null }] }`
    // -- a Flow that filtered, once, on something.
    const screened = screen({
      extractList: {
        item: ".product-card",
        fields: { name: { kind: "text", required: true }, price: { kind: "number" } },
        where: [{ read: "column:Badge", is: "absent" }, { field: "price", atMost: 50 }],
        minItems: 1
      },
      timeoutMs: 15_000
    });
    expect(screened.values).toEqual({
      extractList: {
        item: null,
        fields: { name: { kind: "text", required: true }, price: { kind: "number" } },
        where: { count: 2, items: [{ read: "column:Badge", is: "absent" }, { field: "price", atMost: 50 }] },
        minItems: 1
      },
      timeoutMs: 15_000
    });
    expect(screened.withheld).toEqual(["extractList.item"]);
  });

  it("reads a classifier as Core's word at any depth, and a name only where the keys are the definition's", () => {
    // `kind` is the word the node branches on, so its depth does not matter.
    // `name` beside it is the column the author invented, so its depth is the
    // whole question -- and the two sit one level apart in the same parameter,
    // which is why no single allowance can answer both.
    const screened = screen({
      extractList: {
        fields: { name: "productTitle", price: { kind: "number", required: false } },
        paginate: { mode: "next-link", next: ".pager-next" }
      }
    });
    expect(screened.values).toEqual({
      extractList: {
        fields: { name: null, price: { kind: "number", required: false } },
        paginate: { mode: "next-link", next: null }
      }
    });
    expect(screened.withheld).toEqual(["extractList.fields.name", "extractList.paginate.next"]);
  });

  it("reads a list item's keys as the definition's wherever the list sits, because an author cannot key a list", () => {
    expect(screen({ extractList: { where: [{ read: "Badge", is: "absent" }] } }).values)
      .toEqual({ extractList: { where: { count: 1, items: [{ read: "Badge", is: "absent" }] } } });
    // A scalar item has no key of its own, so it is read under its list's -- the
    // same statement from the other side, and what puts a comparison target in
    // front of the repair at all.
    const compared = screen({ extractList: { where: [{ field: "badge", matches: ["^Sold out"] }] } });
    expect(compared.values)
      .toEqual({ extractList: { where: { count: 1, items: [{ field: "badge", matches: { count: 1, items: ["^Sold out"] } }] } } });
    expect(compared.withheld).toEqual([]);
    // The same rule one parameter on: `expectedState.conditions[i]` is read at
    // the list's level, which is the only reason a condition's own keys are in
    // reach there at all. What one of them carries is the next case's subject.
    expect(screen({ expectedState: { conditions: [{ kind: "text-present", expected: "Aiden Stapler" }], mode: "all" } }).values)
      .toEqual({ expectedState: { conditions: { count: 1, items: [{ kind: "text-present", expected: "Aiden Stapler" }] }, mode: "all" } });
  });

  it("withholds a person's text, a locator and a credential at the depth a classifier is carried from, and names each", () => {
    const screened = screen({
      extractList: {
        fields: {
          email: { kind: "text", text: "aiden@example.com" },
          price: { kind: ".price-text", mode: '[data-role="cell"]' },
          token: { kind: "sk-live-9f2c7a1b3d5e8f0a4c6b", op: "x".repeat(81) }
        }
      }
    });
    expect(screened.values).toEqual({
      extractList: {
        fields: {
          email: { kind: "text", text: null },
          price: { kind: null, mode: null },
          token: { kind: null, op: null }
        }
      }
    });
    expect(screened.withheld).toEqual([
      "extractList.fields.email.text",
      "extractList.fields.price.kind",
      "extractList.fields.price.mode",
      "extractList.fields.token.kind",
      "extractList.fields.token.op"
    ]);
    const carried = JSON.stringify(screened.values);
    expect(carried).not.toContain("aiden@example.com");
    expect(carried).not.toContain("price-text");
    expect(carried).not.toContain("data-role");
    expect(carried).not.toContain("sk-live");
  });

  it("carries what a condition compared against, because that is where a wrong filter is wrong", () => {
    // The same run again: it kept 43 rows where 13 were wanted, and a ceiling of
    // 5 written where 50 was meant, or a badge word the page spells differently,
    // is the whole defect. Neither is visible in `{ count: 1 }`.
    const screened = screen({
      extractList: {
        fields: { name: { kind: "text" }, price: { kind: "number" }, badge: { kind: "text", handling: "exclude" } },
        where: [
          { field: "price", atMost: 5 },
          { read: "column:Badge", contains: ["Sold out", "Backorder"], not: true },
          { field: "name", startsWith: "Refurbished" }
        ]
      }
    });
    expect(screened.values).toEqual({
      extractList: {
        fields: { name: { kind: "text" }, price: { kind: "number" }, badge: { kind: "text", handling: "exclude" } },
        where: {
          count: 3,
          items: [
            { field: "price", atMost: 5 },
            { read: "column:Badge", contains: { count: 2, items: ["Sold out", "Backorder"] }, not: true },
            // A comparand written as one value rather than a list is the same
            // condition to the grammar, so it is the same condition here.
            { field: "name", startsWith: "Refurbished" }
          ]
        }
      }
    });
    expect(screened.withheld).toEqual([]);
  });

  it("carries a column's handling at the depth it lives at, because an excluded column explains a missing answer", () => {
    // `handling` is drawn from the field spec's own closed set and appears only
    // under an author-keyed column, past the allowance -- so it has to be a
    // classifier, and no bounded rule could ever have reached it.
    const screened = screen({ extractList: { fields: { total: { kind: "number", handling: "exclude" }, notes: "noteText" } } });
    expect(screened.values).toEqual({ extractList: { fields: { total: { kind: "number", handling: "exclude" }, notes: null } } });
    expect(screened.withheld).toEqual(["extractList.fields.notes"]);
  });

  it("withholds a comparison target that is a credential, a locator or over-length, and names each", () => {
    // The fourth condition is the control: its target is carried, so what
    // refuses the other three is the credential screen, the locator screen and
    // `MAX_NAME_LENGTH` rather than the position being out of reach.
    const screened = screen({
      extractList: {
        where: [
          { field: "note", contains: ["bearer 9f2c7a1b3d5e8f0a4c6b1e2d"] },
          { field: "cell", matches: ["\\.price-text"] },
          { field: "title", equals: ["x".repeat(81)] },
          { field: "badge", contains: ["Sold out"] }
        ]
      }
    });
    expect(screened.values).toEqual({
      extractList: {
        where: {
          count: 4,
          items: [
            { field: "note", contains: { count: 1 } },
            { field: "cell", matches: { count: 1 } },
            { field: "title", equals: { count: 1 } },
            { field: "badge", contains: { count: 1, items: ["Sold out"] } }
          ]
        }
      }
    });
    expect(screened.withheld).toEqual([
      "extractList.where.0.contains.0",
      "extractList.where.1.matches.0",
      "extractList.where.2.equals.0"
    ]);
    const carried = JSON.stringify(screened.values);
    expect(carried).not.toContain("9f2c7a1b");
    expect(carried).not.toContain("price-text");
    expect(carried).not.toContain("xxxx");
  });

  it("reads a comparand as Core's word only where the keys are the definition's", () => {
    // A column an author happened to name `matches` is a column, and its value is
    // the page's own field name. That is the reason a name is bounded, and a
    // comparand is a value too.
    const screened = screen({ extractList: { fields: { matches: "productTitle", equals: { kind: "text" } } } });
    expect(screened.values).toEqual({ extractList: { fields: { matches: null, equals: { kind: "text" } } } });
    expect(screened.withheld).toEqual(["extractList.fields.matches"]);
  });

  it("carries what an expected-state condition expected, because the same object is already two sections above it", () => {
    // `executor/expected-transition.ts` builds a transition's `expectedState`
    // from `node.parameterValues.expectedState`, and `context.ts` puts that
    // object into `expected_transition` whole. So naming this path as withheld
    // was a false claim about the request it sat in: the value it named was
    // verbatim two sections up. The name in the fixture is the point rather than
    // an oversight -- it is the Flow author's own predicate over the page, not
    // anything the step sends -- and this screen is still stricter with it than
    // `context.ts` is with the identical object.
    const screened = screen({ expectedState: { conditions: [{ kind: "text-present", expected: "Aiden Stapler" }], mode: "all", timeoutMs: 5_000 } });
    expect(screened.values).toEqual({
      expectedState: { conditions: { count: 1, items: [{ kind: "text-present", expected: "Aiden Stapler" }] }, mode: "all", timeoutMs: 5_000 }
    });
    expect(screened.withheld).toEqual([]);
    // A `builtin.policy.expectation` node authors the same conditions at the top
    // level of its parameters rather than under `expectedState`, and the rule has
    // to reach them there too.
    expect(screen({ conditions: [{ kind: "url-contains", expected: "/checkout" }], mode: "any" }).values)
      .toEqual({ conditions: { count: 1, items: [{ kind: "url-contains", expected: "/checkout" }] }, mode: "any" });
    // A comparand the author wrote as a boolean was never withheld at all: no key
    // is consulted for one. That is what made the old rule "withhold a comparand
    // written as text" rather than "withhold a comparand", and a rule that turns
    // on the type the author happened to write is not a property of the position.
    expect(screen({ expectedState: { conditions: [{ kind: "state", expected: true }] } }).values)
      .toEqual({ expectedState: { conditions: { count: 1, items: [{ kind: "state", expected: true }] } } });
  });

  it("carries Core's canonical condition as its operator and its comparand, and still withholds its subject", () => {
    // `{ signalPath, operator, expected }` is the shape `flow-graph.ts` carries
    // whole for every router rule. `operator` is drawn from a closed union Core's
    // own model declares, so it is a classifier exactly as the `op` beside it is;
    // `signalPath` is an address into the run's value bag rather than a word for
    // what a value is, and it stays withheld and named on purpose -- pinned here
    // so the residue is a decision somebody can find rather than an accident.
    const screened = screen({ expectedState: { conditions: [{ signalPath: "page.url", operator: "contains", expected: "/plus" }] } });
    expect(screened.values).toEqual({
      expectedState: { conditions: { count: 1, items: [{ signalPath: null, operator: "contains", expected: "/plus" }] } }
    });
    expect(screened.withheld).toEqual(["expectedState.conditions.0.signalPath"]);
  });

  it("withholds an expected value that is a credential, a locator or over-length, and the payload written beside it", () => {
    const screened = screen({
      expectedState: {
        conditions: [
          { kind: "text-present", expected: "sk-live-9f2c7a1b3d5e8f0a4c6b" },
          { kind: "text-present", expected: ".price-text" },
          { kind: "text-present", expected: "x".repeat(81) },
          { kind: "text-present", expected: "Order confirmed", text: "aiden@example.com" }
        ]
      }
    });
    expect(screened.values).toEqual({
      expectedState: {
        conditions: {
          count: 4,
          items: [
            { kind: "text-present", expected: null },
            { kind: "text-present", expected: null },
            { kind: "text-present", expected: null },
            // The control: the fourth comparand is carried, so what refuses the
            // first three is the credential screen, the locator screen and
            // `MAX_NAME_LENGTH` rather than the position being out of reach. The
            // `text` beside it is refused by the rule the whole vocabulary rests
            // on: a comparand is a test over what the page showed, a payload is
            // what the step sends, and no precedent makes the second safe.
            { kind: "text-present", expected: "Order confirmed", text: null }
          ]
        }
      }
    });
    expect(screened.withheld).toEqual([
      "expectedState.conditions.0.expected",
      "expectedState.conditions.1.expected",
      "expectedState.conditions.2.expected",
      "expectedState.conditions.3.text"
    ]);
    const carried = JSON.stringify(screened.values);
    expect(carried).not.toContain("sk-live");
    expect(carried).not.toContain("price-text");
    expect(carried).not.toContain("aiden@example.com");
    // And the allowance still binds it: a column an author happened to name
    // `expected` is a column, exactly as one named `matches` is.
    const named = screen({ extractList: { fields: { expected: "productTitle" } } });
    expect(named.values).toEqual({ extractList: { fields: { expected: null } } });
    expect(named.withheld).toEqual(["extractList.fields.expected"]);
  });

  it("carries nothing a typing step sent, in either spelling, because a payload is not a comparison", () => {
    const typed = screen({ element: { accessibleName: "Email" }, text: "aiden@example.com", value: ["4111 1111 1111 1111"] });
    expect(typed.values).toEqual({ element: { accessibleName: "Email" }, text: null, value: { count: 1 } });
    expect(typed.withheld).toEqual(["text", "value.0"]);
    // A scalar item is read under its list's key, so a payload written as a list
    // is refused by the same rule the scalar is: the key decides, not the shape.
    const multi = screen({ fields: [{ name: "email", text: "aiden@example.com" }] });
    expect(multi.values).toEqual({ fields: { count: 1, items: [{ name: "email", text: null }] } });
    expect(multi.withheld).toEqual(["fields.0.text"]);
  });

  it("carries a list's scalar items under the list's own key, and nothing the scalar form would not carry", () => {
    expect(screen({ label: ["Add to cart", "Buy now"] }).values)
      .toEqual({ label: { count: 2, items: ["Add to cart", "Buy now"] } });
    const opaque = screen({ handle: ["listings-abc123"] });
    expect(opaque.values).toEqual({ handle: { count: 1 } });
    expect(opaque.withheld).toEqual(["handle.0"]);
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
