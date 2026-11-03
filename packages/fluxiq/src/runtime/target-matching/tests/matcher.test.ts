import { describe, expect, it } from "vitest";
import { createElementMatcher } from "../index.ts";

describe("neutral target matching", () => {
  const matcher = createElementMatcher();
  const browserEvidence = { tagName: "button", selector: "#submit", xpath: "/html/body/button", url: "https://example.test/submit", classNames: ["primary"], attributes: { "data-action": "submit" }, metadata: { ariaLabel: "Submit" } };
  it("matches non-web state identity", () => {
    const best = matcher.bestCandidate({ entityId: "invoice.42", statePath: { namespace: "ledger", path: "invoice.42" } }, [
      { candidateId: "other", entityId: "invoice.99", statePath: "ledger.invoice.99" },
      { candidateId: "invoice", entityId: "invoice.42", statePath: "ledger.invoice.42" }
    ]);
    expect(best).toMatchObject({ candidateId: "invoice", confidence: 0.94, normalizedScore: 1 });
  });
  it("never measures browser fields, even when legacy weights request them", () => {
    const neutral = { entityId: "invoice.42", label: "Invoice" };
    const candidate = { candidateId: "invoice", ...neutral };
    const baseline = matcher.scoreCandidate(neutral, candidate);
    const mixedCandidate = { ...candidate, ...browserEvidence, selector: "#different", tagName: "input" };
    const mixed = matcher.scoreCandidate({ ...neutral, ...browserEvidence }, mixedCandidate, { weights: { selector: 500, tagName: 500, attributes: 500 } });
    const { candidate: _baselineCandidate, ...baselineMeasurement } = baseline;
    const { candidate: _mixedCandidate, ...mixedMeasurement } = mixed;
    expect(mixedMeasurement).toEqual(baselineMeasurement);
    expect(mixed.matchedSignals).toEqual(["label", "entityId"]);
  });
  it("does not promote browser metadata when projecting state evidence", () => {
    const candidates = matcher.candidatesFromStateSnapshot({ namespaces: { ledger: { values: {
      invoice: { value: "Invoice", metadata: { ...browserEvidence, ariaLabel: "Submit", dataTestId: "submit" } },
      opaque: { value: {}, metadata: { selector: "#only-browser-data", xpath: "/html/body" } }
    } } }, presentation: { visualFrames: [{ id: "frame", layers: [{ id: "label", kind: "element", label: "Invoice", metadata: { ...browserEvidence, ariaLabel: "Submit", dataTestId: "submit" } }] }] } });
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) for (const key of ["tagName", "selector", "xpath", "url", "classNames", "attributes", "accessibleName", "testId"]) expect(candidate).not.toHaveProperty(key);
    expect(candidates.find((candidate) => candidate.candidateId === "ledger.invoice")?.visibleText).toBe("Invoice");
  });
});
