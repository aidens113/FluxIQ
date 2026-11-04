import { describe, expect, it } from "vitest";
import { parseAutomationStudioSubflowCard, type AutomationStudioSubflowCard } from "../index.ts";

const VALID: AutomationStudioSubflowCard = {
  partId: "part-apply-filter",
  version: 3,
  name: "Apply a filter",
  purpose: "Narrows the results to one brand",
  sites: ["https://shop.example", "http://localhost:4000"],
  inputs: [{ id: "brand", name: "Brand", required: true }],
  outputs: [{ id: "count", name: "How many remain", required: false }],
  fixedValues: ["In stock"],
  lastingClasses: ["modify_existing"],
  startCheck: { digest: "0123456789abcdef", conditions: 2, says: "On a results page" },
  endCheck: { digest: "sha256:fedcba9876543210", conditions: 1 },
  calls: [{ partId: "part-open-menu", version: 1 }],
  shapeHash: "0011223344556677",
  trust: { tier: "established", counts: { judgedYes: 1, zeroModelRuns: 2, failures: 1 }, lastFailureAtMs: 500 }
};

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioSubflowCard(value);
  return result.ok ? [] : result.issues;
}

function withTrust(tier: string, counts: { judgedYes: number; zeroModelRuns: number; failures: number }, lastFailureAtMs?: number): unknown {
  return { ...VALID, trust: { tier, counts, ...(lastFailureAtMs === undefined ? {} : { lastFailureAtMs }) } };
}

describe("parseAutomationStudioSubflowCard", () => {
  it("returns a fresh card", () => {
    const parsed = parseAutomationStudioSubflowCard(VALID);
    expect(parsed).toEqual({ ok: true, card: VALID });
    if (!parsed.ok) throw new Error("expected a valid card");
    expect(parsed.card.sites).not.toBe(VALID.sites);
    expect(parsed.card.inputs[0]).not.toBe(VALID.inputs[0]);
    expect(parsed.card.trust.counts).not.toBe(VALID.trust.counts);
  });

  it("takes a site only as an origin: no path, no query and no other scheme", () => {
    for (const site of ["https://shop.example/cart", "https://shop.example/", "https://shop.example?x=1", "shop.example", "ftp://shop.example", "chrome://settings", "file:///c:/x", ""]) {
      expect(issuesOf({ ...VALID, sites: [site] }), site).toEqual(["subflow_card.invalid_sites"]);
    }
    expect(issuesOf({ ...VALID, sites: [] })).toEqual([]);
  });

  it("keeps its checks by reference, so a fact's target or literal never reaches a card", () => {
    expect(issuesOf({ ...VALID, startCheck: { digest: "0123456789abcdef", conditions: 1, when: [{ fact: "x", op: "exists", target: { a: 1 } }] } })).toEqual(["subflow_card.invalid_start_check"]);
    expect(issuesOf({ ...VALID, startCheck: { digest: "On the results page", conditions: 1 } })).toEqual(["subflow_card.invalid_start_check"]);
    expect(issuesOf({ ...VALID, endCheck: { digest: "0123456789abcdef", conditions: 0 } })).toEqual(["subflow_card.invalid_end_check"]);
    expect(issuesOf({ ...VALID, endCheck: { digest: "0123456789abcdef", conditions: 1, says: ".results" } })).toEqual(["subflow_card.invalid_end_check"]);
    const { startCheck: _startCheck, endCheck: _endCheck, ...noChecks } = VALID;
    expect(issuesOf(noChecks)).toEqual([]);
  });

  it("never lets a tier claim what its counts have not earned", () => {
    expect(issuesOf(withTrust("established", { judgedYes: 1, zeroModelRuns: 1, failures: 0 }))).toEqual(["subflow_card.trust_not_earned"]);
    expect(issuesOf(withTrust("established", { judgedYes: 1, zeroModelRuns: 2, failures: 0 }))).toEqual([]);
    expect(issuesOf(withTrust("provisional", { judgedYes: 0, zeroModelRuns: 0, failures: 0 }))).toEqual(["subflow_card.trust_not_earned"]);
    expect(issuesOf(withTrust("provisional", { judgedYes: 1, zeroModelRuns: 0, failures: 0 }))).toEqual([]);
    expect(issuesOf(withTrust("unproven", { judgedYes: 0, zeroModelRuns: 0, failures: 0 }))).toEqual([]);
    expect(issuesOf(withTrust("unproven", { judgedYes: 3, zeroModelRuns: 0, failures: 1 }, 9))).toEqual([]);
  });

  it("says when it last failed exactly when it has failed", () => {
    expect(issuesOf(withTrust("unproven", { judgedYes: 0, zeroModelRuns: 0, failures: 1 }))).toEqual(["subflow_card.invalid_trust"]);
    expect(issuesOf(withTrust("unproven", { judgedYes: 0, zeroModelRuns: 0, failures: 0 }, 9))).toEqual(["subflow_card.invalid_trust"]);
    expect(issuesOf(withTrust("trusted", { judgedYes: 0, zeroModelRuns: 0, failures: 0 }))).toEqual(["subflow_card.invalid_trust"]);
    expect(issuesOf(withTrust("unverified", { judgedYes: 0, zeroModelRuns: 0, failures: 0 }))).toEqual(["subflow_card.invalid_trust"]);
  });

  it("pins what it calls, and refuses a call to itself", () => {
    expect(issuesOf({ ...VALID, calls: [{ partId: "part-open-menu" }] })).toEqual(["subflow_card.invalid_calls"]);
    expect(issuesOf({ ...VALID, calls: [{ partId: "part-open-menu", version: 0 }] })).toEqual(["subflow_card.invalid_calls"]);
    expect(issuesOf({ ...VALID, calls: [{ partId: VALID.partId, version: VALID.version }] })).toEqual(["subflow_card.calls_itself"]);
    expect(issuesOf({ ...VALID, calls: [{ partId: VALID.partId, version: 2 }] })).toEqual([]);
  });

  it("reads lasting classes through the act's own vocabulary", () => {
    const parsed = parseAutomationStudioSubflowCard({ ...VALID, lastingClasses: ["create_new", "delete"] });
    expect(parsed.ok && parsed.card.lastingClasses).toEqual(["delete", "create_new"]);
    expect(issuesOf({ ...VALID, lastingClasses: ["spend"] })).toEqual(["subflow_card.invalid_lasting_classes"]);
  });

  it("refuses a port that is not one, and a repeated port", () => {
    expect(issuesOf({ ...VALID, inputs: [{ id: "brand", name: "Brand" }] })).toEqual(["subflow_card.invalid_inputs"]);
    expect(issuesOf({ ...VALID, outputs: [{ id: "a", name: "A", required: true }, { id: "a", name: "B", required: true }] })).toEqual(["subflow_card.invalid_outputs"]);
    expect(issuesOf({ ...VALID, inputs: [{ id: "brand", name: "Brand", required: true, metadata: { binding: { path: "x" } } }] })).toEqual(["subflow_card.invalid_inputs"]);
  });

  it("holds nothing it does not name: no address into a page, page text or token", () => {
    for (const key of ["selector", "pageText", "token", "steps", "digest"]) {
      expect(issuesOf({ ...VALID, [key]: "x" }), key).toEqual(["subflow_card.unknown_key"]);
    }
  });

  it("refuses an address or a token in its words, and a credential among its fixed values", () => {
    expect(issuesOf({ ...VALID, name: "#apply" })).toEqual(["subflow_card.invalid_name"]);
    expect(issuesOf({ ...VALID, purpose: "Bearer abc" })).toEqual(["subflow_card.invalid_purpose"]);
    expect(issuesOf({ ...VALID, fixedValues: ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"] })).toEqual(["subflow_card.invalid_fixed_values"]);
    expect(issuesOf({ ...VALID, fixedValues: [""] })).toEqual(["subflow_card.invalid_fixed_values"]);
    expect(issuesOf({ ...VALID, fixedValues: [4] })).toEqual(["subflow_card.invalid_fixed_values"]);
  });

  it("refuses a shape hash, an id or a version that is not one", () => {
    expect(issuesOf({ ...VALID, shapeHash: "the shape" })).toEqual(["subflow_card.invalid_shape_hash"]);
    expect(issuesOf({ ...VALID, partId: "two words" })).toEqual(["subflow_card.invalid_part_id"]);
    expect(issuesOf({ ...VALID, version: 0 })).toEqual(["subflow_card.invalid_version"]);
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "card", []]) expect(issuesOf(value)).toEqual(["subflow_card.not_object"]);
    const hostile = { ...VALID, get name(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["subflow_card.invalid"]);
  });
});
