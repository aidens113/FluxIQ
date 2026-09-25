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

  it("is safe with no candidates and with a blank name", () => {
    expect(automationStudioMatchName("web.output.dom-click", [])).toBeUndefined();
    expect(automationStudioMatchName("", [])).toBeUndefined();
    expect(automationStudioMatchName("", webNodes)).toBeUndefined();
    expect(automationStudioMatchName("   ", webNodes)).toBeUndefined();
    expect(automationStudioMatchName("...", webNodes)).toBeUndefined();
  });
});
