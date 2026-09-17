// A generated plan node leaves resolution with parameters its domain accepted,
// and never with a handle in them.
//
// The domain here is a stand-in with no browser vocabulary: it issued two
// handles during exploration and remembers what each points at, and it will
// not run a node whose locator it never showed the model. The web domain's own
// resolver is separate work; what these pin is Core's half -- asking about
// every node, and trusting nothing the domain answers.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { automationStudioPlanNodeHandleSites } from "../plan-node-handles.ts";
import {
  AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES,
  assertAutomationStudioFlowBootstrapPlanHandlesResolved,
  resolveAutomationStudioFlowBootstrapPlanParameters
} from "../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;

/** What the stand-in domain issued, and what each handle stands for on its side. */
const ISSUED: Record<string, string> = { "record.row": "ledger://rows/*", "record.total": "ledger://rows/*/total" };

function plan(parameters: JsonObject, extra: JsonObject = { limit: 5 }): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "read", definitionId: "ledger.read_rows", definitionVersion: "1.0.0", parameters, outputActionId: "ledger.read" },
        { key: "note", definitionId: "ledger.note", definitionVersion: "1.0.0", parameters: extra }
      ],
      edges: []
    }]
  };
}

function isHandle(value: JsonValue | undefined): value is { handle: string } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 1 && typeof (value as JsonObject).handle === "string";
}

/** Owns `ledger.read_rows`: rewrites the handles it issued, refuses the rest and any locator it did not show. */
const ledgerResolver: Resolver = ({ nodeDefinitionId, parameters }) => {
  if (nodeDefinitionId !== "ledger.read_rows") return { status: "unchanged" };
  const rewritten: JsonObject = structuredClone(parameters);
  for (const [key, value] of Object.entries(parameters)) {
    if (key === "maxItems") continue;
    if (isHandle(value) && Object.hasOwn(ISSUED, value.handle)) rewritten[key] = ISSUED[value.handle]!;
    else if (isHandle(value)) return { status: "refused", issueCodes: ["ledger.handle_unknown"] };
    else if (typeof value === "string") return { status: "refused", issueCodes: ["ledger.locator_not_observed"] };
  }
  return { status: "resolved", parameters: rewritten };
};

async function resolve(input: AutomationStudioFlowBootstrapPlan, resolver?: unknown, handlesIssued = true) {
  return resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: input,
    projectId: "project.ledger",
    flowId: "flow.close",
    binding: resolver === undefined ? undefined : { resolvePlanNodeParameters: resolver as Resolver },
    handlesIssued
  });
}

describe("finding handle references in a node's parameters", () => {
  it("finds every reference, nested in objects and arrays, with its path", () => {
    expect(automationStudioPlanNodeHandleSites({
      item: { handle: "record.row" },
      fields: { total: { handle: "record.total" }, label: "Total" },
      extra: [{ ignored: 1 }, { handle: "record.row" }]
    })).toEqual({
      sites: [
        { path: ["item"], handle: "record.row" },
        { path: ["fields", "total"], handle: "record.total" },
        { path: ["extra", 1], handle: "record.row" }
      ],
      malformed: false
    });
    // An object with `handle` beside other keys is the node's own value, not a reference.
    expect(automationStudioPlanNodeHandleSites({ element: { handle: "record.row", role: "button" }, selector: "#literal" })).toEqual({ sites: [], malformed: false });
    expect(automationStudioPlanNodeHandleSites(undefined)).toEqual({ sites: [], malformed: false });
  });

  it("reads a reference qualified by where the handle was seen", () => {
    expect(automationStudioPlanNodeHandleSites({ item: { handle: "target.3", location: "https://shop.example.test/cart" } })).toEqual({
      sites: [{ path: ["item"], handle: "target.3", location: "https://shop.example.test/cart" }],
      malformed: false
    });
  });

  it.each([
    ["a location that is not a string", { item: { handle: "target.3", location: 7 } }],
    ["an empty location", { item: { handle: "target.3", location: "" } }],
    ["a location with a control character in it", { item: { handle: "target.3", location: "https://a.test/\n" } }],
    ["a location longer than one may be", { item: { handle: "target.3", location: `https://a.test/${"p".repeat(2_048)}` } }],
    ["a null location", { item: { handle: "target.3", location: null } }],
    ["a reference that is not a string", { item: { handle: 3 } }],
    ["a token with structure in it", { item: { handle: "div > .row" } }],
    ["a token longer than a handle may be", { item: { handle: "a".repeat(65) } }],
    ["more references than a node may name", Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`p${index}`, { handle: `h${index}` }]))]
  ])("calls %s malformed rather than a literal", (_label, parameters) => {
    expect(automationStudioPlanNodeHandleSites(parameters as JsonObject).malformed).toBe(true);
  });
});

describe("resolving a generated plan's parameters through the bound domain", () => {
  it("asks about every node, and rewrites the one whose handles it issued", async () => {
    const resolver = vi.fn(ledgerResolver);
    const input = plan({ item: { handle: "record.row" }, total: { handle: "record.total" }, maxItems: 10 });
    const before = structuredClone(input);

    const result = await resolve(input, resolver);

    expect(result).toMatchObject({ ok: true, resolvedNodeKeys: ["read"] });
    if (!result.ok) throw new Error("unreachable");
    expect(result.plan.subflows[0]!.nodes[1]!.parameters).toEqual({ item: "ledger://rows/*", total: "ledger://rows/*/total", maxItems: 10 });
    expect(result.plan.subflows[0]!.nodes[2]).toEqual(input.subflows[0]!.nodes[2]);
    expect(resolver.mock.calls.map(([call]) => call.nodeDefinitionId)).toEqual(["builtin.control.start", "ledger.read_rows", "ledger.note"]);
    expect(resolver.mock.calls[1]![0]).toEqual({
      projectId: "project.ledger",
      flowId: "flow.close",
      nodeDefinitionId: "ledger.read_rows",
      parameters: { item: { handle: "record.row" }, total: { handle: "record.total" }, maxItems: 10 }
    });
    // A node with no parameters is asked about with an empty object, and keeps having none.
    expect(resolver.mock.calls[0]![0].parameters).toEqual({});
    expect(result.plan.subflows[0]!.nodes[0]).not.toHaveProperty("parameters");
    expect(input).toEqual(before);
  });

  // A handle seen on several pages is only unambiguous with the page it came
  // from, so the domain receives the location exactly as the model wrote it.
  it("round-trips a location-qualified handle to the domain", async () => {
    const seen: JsonObject[] = [];
    const byPage: Resolver = ({ nodeDefinitionId, parameters }) => {
      if (nodeDefinitionId !== "ledger.read_rows") return { status: "unchanged" };
      seen.push(structuredClone(parameters));
      const item = parameters.item as JsonObject;
      if (item.location === undefined) return { status: "refused", issueCodes: ["ledger.handle_ambiguous"] };
      return { status: "resolved", parameters: { item: `${String(item.location)}#${String(item.handle)}` } };
    };
    await expect(resolve(plan({ item: { handle: "target.3" } }), byPage)).resolves.toMatchObject({ ok: false, issues: [{ code: "ledger.handle_ambiguous" }] });
    const result = await resolve(plan({ item: { handle: "target.3", location: "ledger://period/2" } }), byPage);
    expect(result).toMatchObject({ ok: true, resolvedNodeKeys: ["read"] });
    if (!result.ok) throw new Error("unreachable");
    expect(result.plan.subflows[0]!.nodes[1]!.parameters).toEqual({ item: "ledger://period/2#target.3" });
    expect(seen[1]).toEqual({ item: { handle: "target.3", location: "ledger://period/2" } });
  });

  it("refuses a node with the domain's own codes: an unknown handle, or a locator it never showed", async () => {
    await expect(resolve(plan({ item: { handle: "record.invented" } }), ledgerResolver)).resolves.toEqual({
      ok: false,
      issues: [{ severity: "error", code: "ledger.handle_unknown", message: expect.any(String), path: "plan.subflows.0.nodes.1.parameters" }]
    });
    await expect(resolve(plan({ item: "input[name=\"Name\"]" }), ledgerResolver)).resolves.toMatchObject({
      ok: false,
      issues: [{ code: "ledger.locator_not_observed", path: "plan.subflows.0.nodes.1.parameters" }]
    });
  });

  it("keeps up to sixteen distinct refusal codes, and names a refusal that gave none", async () => {
    const many: Resolver = () => ({ status: "refused", issueCodes: ["a.one", "a.one", "not a code", ...Array.from({ length: 20 }, (_, index) => `a.code_${index}`)] });
    const result = await resolve(plan({ item: "x" }, {}), many);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const firstNode = result.issues.filter((item) => item.path === "plan.subflows.0.nodes.0.parameters").map((item) => item.code);
    expect(firstNode).toHaveLength(16);
    expect(firstNode[0]).toBe("a.one");
    const prose = await resolve(plan({ item: "x" }), () => ({ status: "refused", issueCodes: ["The row is gone, try .row-2"] }));
    expect(prose.ok ? [] : prose.issues.map((item) => item.code)).toEqual([CODES.refused, CODES.refused, CODES.refused]);
  });

  it("does not ask the domain, and refuses, when a plan names a handle and nothing explored", async () => {
    const resolver = vi.fn(ledgerResolver);
    await expect(resolve(plan({ item: { handle: "record.row" } }), resolver, false)).resolves.toMatchObject({ ok: false, issues: [{ code: CODES.notIssued, path: "plan.subflows.0.nodes.1.parameters" }] });
    expect(resolver.mock.calls.map(([call]) => call.nodeDefinitionId)).toEqual(["builtin.control.start", "ledger.note"]);
  });

  it("refuses a node naming a handle when the host bound no resolver, and leaves the rest alone", async () => {
    await expect(resolve(plan({ item: { handle: "record.row" } }, { other: { handle: "record.total" } }))).resolves.toMatchObject({ ok: false, issues: [
      { code: CODES.unsupported, path: "plan.subflows.0.nodes.1.parameters" },
      { code: CODES.unsupported, path: "plan.subflows.0.nodes.2.parameters" }
    ] });
    const input = plan({ item: "ledger://rows/*" });
    await expect(resolve(input)).resolves.toEqual({ ok: true, plan: input, resolvedNodeKeys: [] });
    await expect(resolve(plan({ item: { handle: "record.row" } }), "not a function")).resolves.toMatchObject({ ok: false, issues: [{ code: CODES.unsupported }] });
  });

  it("refuses a malformed reference without asking the domain", async () => {
    const resolver = vi.fn(ledgerResolver);
    await expect(resolve(plan({ item: { handle: "div > .row" } }), resolver)).resolves.toMatchObject({ ok: false, issues: [{ code: CODES.malformed }] });
    expect(resolver.mock.calls.map(([call]) => call.nodeDefinitionId)).not.toContain("ledger.read_rows");
  });

  it.each<[string, unknown, string]>([
    ["throws", () => { throw new Error("page is gone"); }, CODES.failed],
    ["rejects", async () => { throw new Error("page is gone"); }, CODES.failed],
    ["answers nothing", () => undefined, CODES.invalid],
    ["answers an unknown status", () => ({ status: "matched" }), CODES.invalid],
    ["adds a field to its answer", () => ({ status: "resolved", parameters: { item: "x" }, note: "extra" }), CODES.invalid],
    ["answers unchanged with parameters", () => ({ status: "unchanged", parameters: { item: "x" } }), CODES.invalid],
    ["answers parameters that are not JSON", () => ({ status: "resolved", parameters: { item: () => "x" } }), CODES.invalid],
    ["answers parameters that are not a plain object", () => ({ status: "resolved", parameters: new Map([["item", "x"]]) }), CODES.invalid],
    ["answers parameters too large to carry", () => ({ status: "resolved", parameters: { item: "x".repeat(20_000) } }), CODES.invalid],
    ["refuses without a list", () => ({ status: "refused", issueCodes: "ledger.handle_unknown" }), CODES.invalid],
    ["says unchanged about a node that names a handle", () => ({ status: "unchanged" }), CODES.unresolved],
    ["swaps in another reference", () => ({ status: "resolved", parameters: { item: { handle: "record.total" } } }), CODES.unresolved]
  ])("refuses the node when the domain %s", async (_label, resolver, code) => {
    const result = await resolve(plan({ item: { handle: "record.row" } }, {}), resolver);
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([{ severity: "error", code, message: expect.any(String), path: "plan.subflows.0.nodes.1.parameters" }]) });
  });

  it("gives the domain a copy, so changing what it was handed changes nothing", async () => {
    const input = plan({ item: { handle: "record.row" } });
    const resolver: Resolver = (request) => {
      (request.parameters as JsonObject).item = "tampered";
      return { status: "refused", issueCodes: ["ledger.handle_stale"] };
    };
    await expect(resolve(input, resolver)).resolves.toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "ledger.handle_stale" })]) });
    expect(input.subflows[0]!.nodes[1]!.parameters).toEqual({ item: { handle: "record.row" } });
  });
});

describe("a plan that did not pass through resolution", () => {
  it("is refused while any node still names a handle, well-formed or not", () => {
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan({ item: { handle: "record.row" } })))
      .toThrow("Invalid Automation Studio Flow Bootstrap plan: plan.subflows.0.nodes.1.parameters (bootstrap.handle_unresolved)");
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan({ item: "x" }, { note: { handle: 1 } })))
      .toThrow("plan.subflows.0.nodes.2.parameters (bootstrap.handle_unresolved)");
    expect(() => assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan({ item: "ledger://rows/*" }))).not.toThrow();
  });
});
