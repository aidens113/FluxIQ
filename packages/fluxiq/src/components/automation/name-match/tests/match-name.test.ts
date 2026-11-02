import { describe, expect, it } from "vitest";
import { automationStudioMatchName, type AutomationStudioNameCandidate } from "../index.ts";

/** The real web node ids a model writes at, so the cases are not synthetic. */
const webNodes: AutomationStudioNameCandidate[] = [
  { id: "web.output.browser-navigate" },
  { id: "web.output.dom-capture_snapshot" },
  { id: "web.output.dom-clear" },
  { id: "web.output.dom-click" },
  { id: "web.output.dom-extract" },
  { id: "web.output.dom-extract_list" },
  { id: "web.output.dom-keypress" },
  { id: "web.output.dom-scroll" },
  { id: "web.output.dom-select" },
  { id: "web.output.dom-type" },
  { id: "web.output.dom-wait_for_selector" },
  { id: "web.output.dom-wait_for_text" },
  { id: "builtin.control.for-each" },
  { id: "builtin.data.filter-list" },
  { id: "builtin.data.set-variable" },
  { id: "builtin.logic.compare" }
];

describe("automationStudioMatchName", () => {
  it("takes the verbatim id over a near match that outranks it on every other signal", () => {
    // The near match is listed first, scores 0.805 on its own, and is the only
    // candidate accepting the shape the caller asked for. Exact still wins.
    const match = automationStudioMatchName(
      "web.output.dom-extract",
      [
        { id: "web.output.dom-extract_list", accepts: "list" },
        { id: "web.output.dom-extract", accepts: "text" }
      ],
      { valueShape: "list" }
    );
    expect(match).toEqual({ id: "web.output.dom-extract", how: "exact", score: 1 });
  });

  it("resolves separator, case and camel-case variants as normalized, not as a guess", () => {
    for (const written of [
      "web.output.dom-extract-list",
      "web.output.dom_extract_list",
      "web/output/dom/extract/list",
      "Web.Output.DOM-Extract-List",
      "web.output.domExtractList",
      "web output dom extract list"
    ]) {
      expect(automationStudioMatchName(written, webNodes), written).toEqual({
        id: "web.output.dom-extract_list",
        how: "normalized",
        score: 1
      });
    }
  });

  it("lets the value shape settle two names that are otherwise equally close", () => {
    // "max items" and "max value" are the same distance from "max" by every
    // signal, so nothing but the shape can separate them.
    const candidates: AutomationStudioNameCandidate[] = [
      { id: "max-items", accepts: "number" },
      { id: "max-value", accepts: "text" }
    ];
    const asText = automationStudioMatchName("max", candidates, { valueShape: "text" });
    const asNumber = automationStudioMatchName("max", candidates, { valueShape: "number" });

    expect(asText?.id).toBe("max-value");
    expect(asNumber?.id).toBe("max-items");
    expect(asText?.how).toBe("nearest");
    // The shape decides the winner and never inflates the reported score.
    expect(asText?.score).toBe(asNumber?.score);
  });

  it("keeps the caller's order when nothing separates two candidates at all", () => {
    const candidates: AutomationStudioNameCandidate[] = [{ id: "max-items" }, { id: "max-value" }];
    expect(automationStudioMatchName("max", candidates)?.id).toBe("max-items");
    expect(automationStudioMatchName("max", candidates, { valueShape: "unknown" })?.id).toBe("max-items");
  });

  it("does not let the value shape override a clearly better name", () => {
    const match = automationStudioMatchName(
      "filter-list",
      [
        { id: "builtin.data.filter-list", accepts: "list" },
        { id: "builtin.data.filter-rows", accepts: "number" }
      ],
      { valueShape: "number" }
    );
    expect(match?.id).toBe("builtin.data.filter-list");
    expect(match?.how).toBe("nearest");
  });

  it("scores a name written short or mistyped as the nearest real node", () => {
    const short = automationStudioMatchName("dom-extract-list", webNodes);
    expect(short?.id).toBe("web.output.dom-extract_list");
    expect(short?.how).toBe("nearest");
    expect(short?.score).toBeGreaterThan(0.8);
    expect(short?.score).toBeLessThan(1);

    expect(automationStudioMatchName("filterList", webNodes)?.id).toBe("builtin.data.filter-list");
    expect(automationStudioMatchName("for_each", webNodes)?.id).toBe("builtin.control.for-each");
    expect(automationStudioMatchName("navigate", webNodes)?.id).toBe("web.output.browser-navigate");
    // `lst` is `list` with a letter missing, so this is the extraction node and
    // not the shorter single-value one. It used to answer `web.output.dom-extract`,
    // because every token of that name appears in what was written and
    // containment leads the blend, while the one letter separating it from the
    // node actually meant showed up only in the edit term. A typo now carries on
    // its own (`../similarity.ts`), so the nearer name wins.
    expect(automationStudioMatchName("web.output.dom_extract_lst", webNodes)?.id).toBe("web.output.dom-extract_list");
  });

  it("resolves a name misspelled inside its only token, which is how a parameter comes out wrong", () => {
    // The blend was fitted to node ids, which are several tokens long. A
    // parameter name is usually one token, and a name misspelled inside its
    // only token shares no whole token with the right one: containment and dice
    // are both 0, so the score could never clear the floor however obvious the
    // slip. Every case here was measured failing before the typo rule.
    const parameters = [{ id: "target" }, { id: "timeoutMs" }, { id: "maxRecords" }, { id: "url" }];
    expect(automationStudioMatchName("targe", parameters)?.id).toBe("target");
    expect(automationStudioMatchName("tagret", parameters)?.id).toBe("target");
    expect(automationStudioMatchName("maxrecords", parameters)?.id).toBe("maxRecords");
    expect(automationStudioMatchName("timeout_ms", parameters)?.id).toBe("timeoutMs");

    // A typo is a small number of characters, not any short name at all.
    expect(automationStudioMatchName("banana", parameters)).toBeUndefined();
    expect(automationStudioMatchName("screenshot", parameters)).toBeUndefined();
  });

  it("returns undefined for a name nothing plausible was written for", () => {
    for (const written of ["screenshot", "sendEmail", "http.request", "upload-file", "sleep", "banana", "x"]) {
      expect(automationStudioMatchName(written, webNodes), written).toBeUndefined();
    }
  });

  it("scores every node id exactly as it did before the token measures learned to see a near token", () => {
    // These are the figures `../score-floor.ts` argues 0.25 from, and they are
    // pinned here because the fix for a short name against a long one had to
    // leave them alone. Every one of these written names shares whole tokens
    // with the id it resolves to, so nothing about it is a near token or a
    // synonym, and the score is the same arithmetic it always was.
    const scoreOf = (written: string) => automationStudioMatchName(written, webNodes)?.score;
    expect(scoreOf("dom-extract-list")).toBe(0.823);
    expect(scoreOf("filterList")).toBe(0.765);
    expect(scoreOf("for_each")).toBe(0.733);
    expect(scoreOf("navigate")).toBe(0.644);
    expect(scoreOf("compare")).toBe(0.683);
    expect(scoreOf("web.output.dom_extract_lst")).toBe(0.963);
    // The one case measured between the two bands, which the floor admits.
    expect(automationStudioMatchName("click-element", webNodes)).toEqual({ id: "web.output.dom-click", how: "nearest", score: 0.338 });
  });

  it("resolves a short name against a long one, which is what an instruction's own words are", () => {
    // The names a real catalog's page detection offers, against the words a
    // person asks for: "with columns name, price, rating and url". Two of those
    // four used to be refused, and the reason was never how close they were.
    // `name` was credited a whole shared token and reached 0.733; `url` shares
    // no token with `product-link`, so the only signal left was an edit distance
    // over the candidate's entire string, and it scored 0.042 -- below `banana`.
    // Lengthen the candidate and it would fall further while being no less right.
    const detected: AutomationStudioNameCandidate[] = [
      { id: "product-name" },
      { id: "product-price" },
      { id: "product-rating" },
      { id: "product-link" },
      { id: "stock-badge" },
      { id: "product-image_src" },
      { id: "product-image_alt" }
    ];
    const resolved = (written: string) => {
      const match = automationStudioMatchName(written, detected);
      return match ? [match.id, match.score] : undefined;
    };

    // Unmoved: a written word that is a whole token of the name it means.
    expect(resolved("name")).toEqual(["product-name", 0.733]);
    expect(resolved("price")).toEqual(["product-price", 0.746]);
    expect(resolved("rating")).toEqual(["product-rating", 0.757]);
    expect(resolved("stock")).toEqual(["stock-badge", 0.764]);
    expect(resolved("link")).toEqual(["product-link", 0.733]);

    // A different word for the same thing, which no comparison of characters
    // can reach. `url` is the fourth column of the instruction this was
    // measured against.
    expect(resolved("url")).toEqual(["product-link", 0.497]);
    expect(resolved("title")).toEqual(["product-name", 0.497]);
    expect(resolved("heading")).toEqual(["product-name", 0.497]);
    expect(resolved("cost")).toEqual(["product-price", 0.493]);

    // A typo of a short word inside a long candidate: the family that scored as
    // if it shared nothing with the candidate at all.
    expect(resolved("prce")).toEqual(["product-price", 0.597]);
    expect(resolved("ratng")).toEqual(["product-rating", 0.631]);
    expect(resolved("ratings")).toEqual(["product-rating", 0.646]);

    // A word with no plausible answer is still an honest failure. Two of these
    // scored 0.042 and 0.068 before, the same band `url` was in -- which is why
    // moving the floor could never have been the fix.
    for (const written of ["banana", "sponsored", "description", "quantity"]) {
      expect(automationStudioMatchName(written, detected), written).toBeUndefined();
    }
  });

  it("prefers a real near match to a synonym, and a synonym to nothing", () => {
    // The vocabulary answers only where nothing closer does.
    expect(automationStudioMatchName("url", [{ id: "product-link" }, { id: "product-url-slug" }])?.id).toBe("product-url-slug");
    expect(automationStudioMatchName("price", [{ id: "product-cost" }, { id: "product-prices" }])?.id).toBe("product-prices");
    // Spelled exactly, it is not a guess at all.
    expect(automationStudioMatchName("name", [{ id: "title" }, { id: "name" }])).toEqual({ id: "name", how: "exact", score: 1 });
    // And a synonym is reported as the guess it is, never as a spelling variant.
    expect(automationStudioMatchName("heading", [{ id: "label" }, { id: "mode" }])).toEqual({ id: "label", how: "nearest", score: 0.561 });
  });

  it("is safe with no candidates and with a blank name", () => {
    expect(automationStudioMatchName("web.output.dom-click", [])).toBeUndefined();
    expect(automationStudioMatchName("", [])).toBeUndefined();
    expect(automationStudioMatchName("", webNodes)).toBeUndefined();
    expect(automationStudioMatchName("   ", webNodes)).toBeUndefined();
    expect(automationStudioMatchName("...", webNodes)).toBeUndefined();
  });
});
