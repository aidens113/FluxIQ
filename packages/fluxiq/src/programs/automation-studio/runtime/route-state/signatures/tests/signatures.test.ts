// The route signatures a node keeps, and the host's sign and compare as Core
// reads them: Core carries what the host made, never reads inside it, and
// treats a host that misbehaves as one that said nothing.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import {
  AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS,
  AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY,
  automationStudioCompareRouteSignatures,
  automationStudioNodeRouteSignatures,
  automationStudioRouteEffectHolds,
  automationStudioRouteSignaturesValue,
  automationStudioSignRouteEffect,
  automationStudioSignRouteState
} from "../index.ts";

const host = (members: Partial<AutomationStudioHostRuntimeBoundary>): AutomationStudioHostRuntimeBoundary => ({ capabilities: ["route-state"], ...members });

describe("automationStudioSignRouteState", () => {
  it("returns the host's signature of a state", () => {
    const signed = automationStudioSignRouteState(host({ signRouteState: (state) => ({ v: "t.v1", page: String((state.page as JsonObject).path) }) }), { page: { path: "/cart" } });
    expect(signed).toEqual({ ok: true, signature: { v: "t.v1", page: "/cart" } });
  });

  it("says why there is no signature when the host signs no states, throws, or answers with no object", () => {
    expect(automationStudioSignRouteState(undefined, { page: {} })).toEqual({ ok: false, reason: "The host signs no route states." });
    expect(automationStudioSignRouteState(host({}), { page: {} })).toEqual({ ok: false, reason: "The host signs no route states." });
    expect(automationStudioSignRouteState(host({ signRouteState: () => { throw new Error("no"); } }), { page: {} })).toEqual({ ok: false, reason: "The host could not sign the route state." });
    expect(automationStudioSignRouteState(host({ signRouteState: () => [] as unknown as JsonObject }), { page: {} })).toEqual({ ok: false, reason: "A route signature must be a JSON object." });
    expect(automationStudioSignRouteState(host({ signRouteState: () => ({}) }), { page: {} })).toEqual({ ok: false, reason: "A route signature must not be empty." });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(automationStudioSignRouteState(host({ signRouteState: () => cyclic as JsonObject }), { page: {} })).toEqual({ ok: false, reason: "The route signature is not JSON." });
  });

  it("refuses a signature larger than the bound: that is a page, not a signature", () => {
    const page = { text: "x".repeat(AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS) };
    const signed = automationStudioSignRouteState(host({ signRouteState: () => page }), { page: {} });
    expect(signed.ok).toBe(false);
    expect(signed.ok ? "" : signed.reason).toMatch(/past the bound of 2048/u);
  });
});

describe("automationStudioCompareRouteSignatures", () => {
  it("asks the host, and holds closeness to 0..1", () => {
    const compare = host({ compareRouteSignatures: (recorded, observed) => ({ matches: recorded.k === observed.k, closeness: recorded.k === observed.k ? 7 : -3 }) });
    expect(automationStudioCompareRouteSignatures(compare, { k: 1 }, { k: 1 })).toEqual({ matches: true, closeness: 1 });
    expect(automationStudioCompareRouteSignatures(compare, { k: 1 }, { k: 2 })).toEqual({ matches: false, closeness: 0 });
  });

  it("holds a host with no comparator to structural equality, key order ignored", () => {
    expect(automationStudioCompareRouteSignatures(host({}), { a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toEqual({ matches: true, closeness: 1 });
    expect(automationStudioCompareRouteSignatures(undefined, { a: 1 }, { a: 2 })).toEqual({ matches: false, closeness: 0 });
  });

  it("reads a comparator that throws or answers in another shape as no match", () => {
    expect(automationStudioCompareRouteSignatures(host({ compareRouteSignatures: () => { throw new Error("no"); } }), { a: 1 }, { a: 1 })).toEqual({ matches: false, closeness: 0 });
    expect(automationStudioCompareRouteSignatures(host({ compareRouteSignatures: () => ({ matches: "yes", closeness: 1 }) as never }), { a: 1 }, { a: 1 })).toEqual({ matches: false, closeness: 0 });
    expect(automationStudioCompareRouteSignatures(host({ compareRouteSignatures: () => ({ matches: true, closeness: Number.NaN }) }), { a: 1 }, { a: 1 })).toEqual({ matches: false, closeness: 0 });
  });
});

describe("node route signatures", () => {
  it("reads what a node recorded under its metadata key", () => {
    const node = { metadata: { [AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY]: { before: { s: "a" }, after: { s: "b" } } } };
    expect(automationStudioNodeRouteSignatures(node)).toEqual({ before: { s: "a" }, after: { s: "b" } });
    expect(automationStudioNodeRouteSignatures({})).toEqual({});
  });

  it("refuses a value that is not exactly signatures", () => {
    expect(automationStudioRouteSignaturesValue({ before: { s: "a" } })).toEqual({ before: { s: "a" } });
    expect(automationStudioRouteSignaturesValue({ before: { s: "a" }, effect: { e: ["h1"] } })).toEqual({ before: { s: "a" }, effect: { e: ["h1"] } });
    expect(automationStudioRouteSignaturesValue({ effect: "gained" })).toBeUndefined();
    expect(automationStudioRouteSignaturesValue({})).toBeUndefined();
    expect(automationStudioRouteSignaturesValue({ before: { s: "a" }, during: { s: "b" } })).toBeUndefined();
    expect(automationStudioRouteSignaturesValue({ before: "a" })).toBeUndefined();
    expect(automationStudioRouteSignaturesValue({ before: {} })).toBeUndefined();
    expect(automationStudioRouteSignaturesValue([{ before: { s: "a" } }])).toBeUndefined();
    expect(automationStudioRouteSignaturesValue({ after: { text: "x".repeat(AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS) } })).toBeUndefined();
  });
});

describe("step effects", () => {
  it("records the host's effect of a step from the states either side of it", () => {
    const recorded = automationStudioSignRouteEffect(host({ signRouteEffect: (before, after) => ({ v: "t.e1", from: String(before.at), to: String(after.at) }) }), { at: "a" }, { at: "b" });
    expect(recorded).toEqual({ ok: true, signature: { v: "t.e1", from: "a", to: "b" } });
  });

  it("says why no effect was recorded", () => {
    expect(automationStudioSignRouteEffect(undefined, { at: "a" }, { at: "b" })).toEqual({ ok: false, reason: "The host records no step effects." });
    expect(automationStudioSignRouteEffect(host({ signRouteEffect: () => { throw new Error("no"); } }), { at: "a" }, { at: "b" })).toEqual({ ok: false, reason: "The host could not record the step's effect." });
    expect(automationStudioSignRouteEffect(host({ signRouteEffect: () => ({}) }), { at: "a" }, { at: "b" })).toEqual({ ok: false, reason: "A route signature must not be empty." });
  });

  it("holds only on the host's positive answer", () => {
    const observed = { page: { controls: "Millbrook" } };
    expect(automationStudioRouteEffectHolds(host({ routeEffectHolds: () => true }), { e: 1 }, observed)).toEqual({ holds: true });
    expect(automationStudioRouteEffectHolds(host({ routeEffectHolds: () => false }), { e: 1 }, observed)).toEqual({ holds: false, reason: "The page does not show the step's recorded effect." });
    expect(automationStudioRouteEffectHolds(host({ routeEffectHolds: () => "yes" as unknown as boolean }), { e: 1 }, observed).holds).toBe(false);
    expect(automationStudioRouteEffectHolds(host({ routeEffectHolds: () => { throw new Error("no"); } }), { e: 1 }, observed)).toEqual({ holds: false, reason: "The host could not test the step's effect against the page." });
    expect(automationStudioRouteEffectHolds(undefined, { e: 1 }, observed)).toEqual({ holds: false, reason: "The host cannot tell whether a step's effect is on the page." });
  });
});
