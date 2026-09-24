// The wrapper a model puts its nodes in, and every arrangement of it that
// means the same Flow.
//
// `bootstrap.invalid_subflows` -- "Bootstrap subflows must be an array" -- was
// the single most repeated refusal of the live creation campaign. On
// 2026-09-24 the run `run-mug2cjui-500e997c`
// (`social-network-feed-confirm-requests`) spent 13 of its 28 decisions on it:
// the model wrote a plan, was refused, rewrote it, and was refused again,
// thirteen times, for 27 provider calls and no Flow. Earlier runs on other
// sites repeated the same refusal 15, 16 and 24 times.
//
// The sentence named nothing the model could change, because the wrapper is
// not what a plan means. Each case below is one arrangement of the same two
// steps -- navigate, then click -- and each must now build. The refusals at the
// end are the other half: a plan that really holds no nodes is still refused,
// and the refusal says what it received and what would be accepted, because a
// refusal a model cannot act on differently is how that loop began.

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapIssueFeedback, validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { normaliseAutomationStudioFlowBootstrapJsonPlan } from "../json-plan.ts";

const definitions = [...webDomainNodeDefinitionsFixture(), ...canonicalBuiltinAutomationNodeDefinitions];
const registry = new AutomationStudioNodeRegistry(definitions);
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

/** The two steps every accepted shape below is an arrangement of. */
const NAVIGATE = { definitionId: "web.browser.navigate", parameters: { url: "https://shop.test/members" } };
const CLICK = { definitionId: "web.dom.click", parameters: { selector: "li.member" } };

function accept(result: JsonValue) {
  return acceptAutomationStudioFlowBootstrapResult({ result, registry, resolution });
}

/** The definition ids of one subflow's nodes, in order, or the issues that refused the plan. */
function builtNodes(result: JsonValue, subflow = 0): string[] | string[] {
  const accepted = accept(result);
  if (!accepted.ok) return accepted.issues.map((issue) => `${issue.code} @ ${issue.path}`);
  return accepted.plan.subflows[subflow]?.nodes.map((node) => node.definitionId) ?? [];
}

// A step naming an action resolves to the output node that performs it, which
// is what a built plan holds; the action id it came from stays as the node's
// `outputActionId`.
const BOTH_STEPS = ["web.output.browser-navigate", "web.output.dom-click"];

describe("the wrapper a model put its nodes in", () => {
  it("reads subflows written as an object keyed by subflow name", () => {
    const accepted = accept({
      summary: "Open the members page, then open a member.",
      plan: { subflows: { main: { nodes: [NAVIGATE, CLICK] } } }
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows.map((subflow) => [subflow.key, subflow.role])).toEqual([["main", "primary"]]);
    expect(accepted.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(BOTH_STEPS);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).ok).toBe(true);
  });

  it("takes each key of that object as the subflow's key, where the subflow wrote none", () => {
    const accepted = accept({
      summary: "Open the members page, then open a member.",
      plan: { subflows: { "Open the list": { nodes: [NAVIGATE] }, openMember: { nodes: [CLICK] } } }
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows.map((subflow) => subflow.key)).toEqual(["open-the-list", "openmember"]);
  });

  it("reads a single subflow object where a list of one was expected", () => {
    expect(builtNodes({ summary: "Open a member.", plan: { subflows: { key: "main", nodes: [NAVIGATE, CLICK] } } })).toEqual(BOTH_STEPS);
  });

  it("reads a bare list of nodes written under subflows, with no subflow wrapper at all", () => {
    expect(builtNodes({ summary: "Open a member.", plan: { subflows: [NAVIGATE, CLICK] } })).toEqual(BOTH_STEPS);
  });

  it("reads a single node written under subflows", () => {
    expect(builtNodes({ summary: "Open the members page.", plan: { subflows: NAVIGATE } })).toEqual(["web.output.browser-navigate"]);
  });

  it("reads subflows written as an array of node lists, one array per subflow", () => {
    const accepted = accept({ summary: "Open a member.", plan: { subflows: [[NAVIGATE, CLICK]] } });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.key).toBe("main");
    expect(accepted.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(BOTH_STEPS);
  });

  it("reads the node list under steps and under actions, at the subflow's own level", () => {
    expect(builtNodes({ plan: { subflows: [{ steps: [NAVIGATE, CLICK] }] } })).toEqual(BOTH_STEPS);
    expect(builtNodes({ plan: { subflows: [{ actions: [NAVIGATE, CLICK] }] } })).toEqual(BOTH_STEPS);
  });

  it("reads the node list however that word was spelled", () => {
    expect(builtNodes({ plan: { subflows: [{ Nodes: [NAVIGATE, CLICK] }] } })).toEqual(BOTH_STEPS);
  });

  it("reads a plan written as the bare list of nodes itself", () => {
    expect(builtNodes([NAVIGATE, CLICK])).toEqual(BOTH_STEPS);

    // And through the reader directly, since that is the value a caller which
    // already unwrapped the reply hands it.
    const normalised = normaliseAutomationStudioFlowBootstrapJsonPlan({
      value: [NAVIGATE, CLICK],
      registry,
      resolution,
      summary: "Open a member."
    });
    expect(normalised.plan?.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(BOTH_STEPS);
  });

  it("finds a node list the plan nested one level down", () => {
    expect(builtNodes({ summary: "Open a member.", plan: [NAVIGATE, CLICK] })).toEqual(BOTH_STEPS);
    expect(builtNodes({ summary: "Open a member.", graph: { nodes: [NAVIGATE, CLICK] } })).toEqual(BOTH_STEPS);
  });

  it("does not mistake the router for the Flow when it scans", () => {
    const accepted = accept({ summary: "Open a member.", router: { name: "Members", rules: [] }, workflow: { nodes: [NAVIGATE, CLICK] } });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows).toHaveLength(1);
    expect(accepted.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(BOTH_STEPS);
  });

  it("reads a step written as the bare id of the node it runs", () => {
    const accepted = accept({ plan: { nodes: ["web.browser.navigate"] } });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.definitionId).toBe("web.output.browser-navigate");
  });

  // A plan that wrote real subflows must never be taken apart into one: an
  // entry holding a node list settles the whole array as subflows.
  it("still reads an array of real subflows as subflows", () => {
    const accepted = accept({
      summary: "Open a member.",
      plan: { subflows: [{ key: "main", nodes: [NAVIGATE] }, { key: "open", role: "utility", nodes: [CLICK] }] }
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows.map((subflow) => [subflow.key, subflow.nodes.length])).toEqual([["main", 1], ["open", 1]]);
  });
});

describe("a plan that really holds no nodes", () => {
  it("names the plan's own keys and the shapes that would be accepted", () => {
    const accepted = accept({ summary: "Confirm the pending requests.", notes: "nothing ran" });
    const refusal = accepted.issues.find((issue) => issue.code === "bootstrap.invalid_subflows");

    expect(refusal).toBeDefined();
    expect(refusal?.message).toContain("subflows is absent");
    expect(refusal?.message).toContain("keys summary, notes");
    expect(refusal?.message).toContain('{"nodes":[...]}');
    expect(refusal?.message).toContain("nodes, steps, actions");
    // The old sentence, which named nothing the model could change.
    expect(refusal?.message).not.toBe("Bootstrap subflows must be an array.");
  });

  it("says which empty thing subflows was", () => {
    expect(accept({ plan: { subflows: [] } }).issues[0]?.message).toContain("subflows is an empty array");
    expect(accept({ plan: { subflows: {} } }).issues[0]?.message).toContain("subflows is an empty object");
    expect(accept({ plan: { subflows: ["main", "recover"] } }).issues[0]?.message).toContain("subflows is an array of 2 strings");
  });

  it("names the shape a plan that is not an object at all arrived as", () => {
    const normalised = normaliseAutomationStudioFlowBootstrapJsonPlan({ value: 7, registry, resolution, summary: "Open a member." });

    expect(normalised.plan).toBeUndefined();
    expect(normalised.issues.map((issue) => issue.code)).toEqual(["bootstrap.invalid_plan"]);
    expect(normalised.issues[0]?.message).toContain("Bootstrap plan is a number");
    expect(normalised.issues[0]?.message).toContain('{"nodes":[...]}');
  });

  // A refusal travels back to the model, so it carries structure and nothing
  // else: the keys the model chose, never the values, which may hold whatever
  // the page held.
  it("quotes no value the reply carried", () => {
    const secret = "session-token-9f3a-do-not-echo";
    const accepted = accept({ summary: secret, subflows: { count: 2, note: secret } });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    for (const issue of accepted.issues) expect(issue.message).not.toContain(secret);
    expect(accepted.issues[0]?.message).toContain("subflows is an object with keys count, note");
  });

  // Measured here rather than asserted from reading the code, because it
  // decides whether any of the above reaches the model at all.
  //
  // `automationStudioFlowBootstrapIssueFeedback` is what a refused build is
  // asked again with, and it used to carry an issue's own sentence only for a
  // route code or a parameter shape; everything else arrived as a bare code and
  // path, so the refusal written above was invisible to the model.
  //
  // That was the other half of the 13-refusal loop, in
  // `../../plan/issue-feedback.ts`. Accepting the shapes stops the loop because
  // the plan now builds instead of being refused; carrying the sentence is what
  // lets a model correct the refusals that remain. A validator's message is
  // still withheld, because it can quote the value it refused.
  it("sends the refusal's own sentence back with the code, so a rewrite has somewhere to go", () => {
    const accepted = accept({ summary: "Confirm the pending requests." });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    const feedback = automationStudioFlowBootstrapIssueFeedback({ issues: accepted.issues, registry, resolution });

    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ code: "bootstrap.invalid_subflows", path: "plan.subflows" });
    // The sentence is bounded, so assert what a rewrite actually needs and what
    // survives the bound: what was wrong, and a plan shape to copy.
    const message = String((feedback[0] as { message?: unknown }).message);
    expect(message).toContain("subflows is absent");
    expect(message).toContain("\"nodes\"");
  });
});

describe("what a looser wrapper still does not let through", () => {
  it("refuses a node naming a definition the registry does not resolve", () => {
    const accepted = accept({ plan: { subflows: [{ definitionId: "web.dom.definitely_not_a_node", parameters: {} }] } });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues.map((issue) => issue.code)).toContain("bootstrap.definition_unavailable");
  });

  it("refuses a bare node id the registry does not resolve", () => {
    const accepted = accept({ plan: { nodes: ["web.dom.definitely_not_a_node"] } });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues.map((issue) => issue.code)).toContain("bootstrap.definition_unavailable");
  });

  it("still refuses a key that names no parameter of the node it was written on", () => {
    const accepted = accept({ plan: { subflows: { main: { nodes: [{ definitionId: "web.browser.navigate", parameters: { url: "https://shop.test", speed: "fast" } }] } } } });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_parameter");
  });
});
