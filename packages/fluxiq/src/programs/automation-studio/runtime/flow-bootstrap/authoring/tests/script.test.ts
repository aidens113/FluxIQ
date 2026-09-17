import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

// What a model actually writes to build a Flow, and what Core makes of it.
//
// Every script below is written the way a model writes prose: one fact per
// line, no brackets, no quotes, no escaping, and no id, version, key or edge
// anywhere. The assertions are about what Core derives from it, and about the
// three things it refuses rather than guesses -- a label that names nothing, a
// label used twice, and a port a node does not declare.

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

function build(flow: string) {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
  if (!accepted.ok) return { accepted, validated: undefined };
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
  return { accepted, validated };
}

function codes(issues: ReadonlyArray<{ code: string }>): string[] {
  return issues.map((issue) => issue.code);
}

const LINEAR = [
  "flow: Rename a member",
  "step: open the members page",
  "  node: web.browser.navigate",
  "  url: https://shop.test/members?tab=all",
  "step: click the member's row",
  "  node: web.dom.click",
  "  selector: [data-testid=member-row]",
  "step: type the new name",
  "  node: web.dom.type",
  "  selector: [data-testid=member-name]",
  "  text: Ada Lovelace"
].join("\n");

describe("a Flow written as plain lines", () => {
  it("builds and validates a three-step Flow that names no id, version, key or edge", () => {
    const { accepted, validated } = build(LINEAR);

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(codes(validated?.issues ?? [])).toEqual([]);
    const subflow = accepted.plan.subflows[0]!;
    expect(accepted.summary).toBe("Rename a member");
    expect(accepted.plan.schemaVersion).toBe("0.1");
    expect(subflow.role).toBe("primary");
    expect(accepted.plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: subflow.key });
    expect(subflow.nodes.map((node) => [node.definitionId, node.definitionVersion, node.outputActionId])).toEqual([
      ["web.output.browser-navigate", "1.0.0", "web.browser.navigate"],
      ["web.output.dom-click", "1.0.0", "web.dom.click"],
      ["web.output.dom-type", "1.0.0", "web.dom.type"]
    ]);
    expect(subflow.edges.map((edge) => `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}:${edge.target.portId}`)).toEqual([
      "s1:success>s2:in",
      "s2:success>s3:in"
    ]);
  });

  it("keeps every colon in a value and never asks for an escape", () => {
    const { accepted } = build(LINEAR);

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters?.url).toBe("https://shop.test/members?tab=all");
  });

  it("writes in the default of every parameter the model left out, and leaves the rest absent", () => {
    const { accepted } = build(LINEAR);

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const navigate = accepted.plan.subflows[0]!.nodes[0]!.parameters!;
    // newTab defaults to false and timeoutMs to ten seconds; both are now on the node.
    expect(navigate.newTab).toBe(false);
    const type = accepted.plan.subflows[0]!.nodes[2]!.parameters!;
    expect(type.timeoutMs).toBe(10_000);
    expect(type.recordOutput).toBeUndefined();
    // expectedState has neither a default nor a requirement, so nothing invents one.
    expect(Object.hasOwn(type, "expectedState")).toBe(false);
    expect(Object.hasOwn(navigate, "expectedState")).toBe(false);
  });

  it("continues a value on the next line when that line has no key", () => {
    const { accepted } = build([
      "step: wait for the notice",
      "  node: web.dom.wait_for_text",
      "  text: The member was renamed.",
      "  It may take a moment to appear."
    ].join("\n"));

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters?.text)
      .toBe("The member was renamed.\nIt may take a moment to appear.");
  });

  it("reads a line it cannot place as a warning and keeps the Flow", () => {
    const read = parseAutomationStudioFlowScript(["I will now build the Flow", ...LINEAR.split("\n")].join("\n"));

    expect(codes(read.issues)).toEqual(["flow_script.unrecognized_line"]);
    expect(read.issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(read.script.blocks[0]?.steps).toHaveLength(3);
  });

  it("builds a structured parameter from dotted keys without any JSON", () => {
    const { accepted, validated } = build([
      "flow: Scrape the products",
      "step: read the product list",
      "  node: web.dom.extract_list",
      "  extractList: extraction.1",
      "  extractList.fields.name: product-name",
      "  extractList.fields.url: product-link@href",
      "  extractList.paginate: false"
    ].join("\n"));

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters?.extractList).toEqual({
      handle: "extraction.1",
      fields: { name: "product-name", url: "product-link@href" },
      paginate: false
    });
  });
});

describe("branching, which order alone cannot express", () => {
  const FAILURE_BRANCH = [
    "flow: Save a member",
    "step: open the members page",
    "  node: web.browser.navigate",
    "  url: https://shop.test/members",
    "step save: click save",
    "  node: web.dom.click",
    "  selector: [data-testid=save]",
    "  on failed: go to warn",
    "step: confirm it saved",
    "  node: web.dom.wait_for_text",
    "  text: Member saved",
    "step warn: read why it did not save",
    "  node: web.dom.wait_for_text",
    "  text: Could not save"
  ].join("\n");

  it("sends a named port to a labelled step and keeps the rest in order", () => {
    const { accepted, validated } = build(FAILURE_BRANCH);

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(accepted.plan.subflows[0]?.edges.map((edge) => `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}`)).toEqual([
      "s2:failed>s4",
      "s1:success>s2",
      "s2:success>s3"
    ]);
  });

  it("takes two named outcomes from one step", () => {
    const { accepted, validated } = build([
      "flow: Check for the banner",
      "step check: wait for the banner",
      "  node: web.dom.wait_for_selector",
      "  selector: [data-testid=banner]",
      "  on success: go to seen",
      "  on failed: go to missing",
      "step seen: read the banner",
      "  node: web.dom.wait_for_text",
      "  text: Welcome back",
      "step missing: read the empty state",
      "  node: web.dom.wait_for_text",
      "  text: Nothing to show"
    ].join("\n"));

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(accepted.plan.subflows[0]?.edges.map((edge) => `${edge.source.portId}>${edge.target.nodeKey}`)).toEqual([
      "success>s2",
      "failed>s3"
    ]);
  });

  it("runs a named block from the main sequence", () => {
    const { accepted, validated } = build([
      "flow: Open the catalogue and read it",
      "step: open the catalogue",
      "  node: web.browser.navigate",
      "  url: https://shop.test/products",
      "step: run subflow read prices",
      "subflow read prices:",
      "step: read the product list",
      "  node: web.dom.extract_list",
      "  extractList.item: li.product",
      "  extractList.fields.name: .name",
      "end"
    ].join("\n"));

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(accepted.plan.subflows.map((subflow) => [subflow.key, subflow.role, subflow.nodes.length])).toEqual([
      ["main", "primary", 1],
      ["read-prices", "utility", 1]
    ]);
    expect(accepted.plan.router.rules).toEqual([
      { key: "r1", name: "run subflow read prices", targetSubflowKey: "read-prices", routeTags: ["read prices"] }
    ]);
  });

  it("refuses a branch to a label no step carries, naming the label", () => {
    const { accepted } = build([
      "step save: click save",
      "  node: web.dom.click",
      "  selector: [data-testid=save]",
      "  on failed: go to nowhere"
    ].join("\n"));

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(codes(accepted.issues)).toContain("flow_script.unknown_label");
    expect(accepted.issues[0]?.message).toContain("nowhere");
    expect(accepted.issues[0]?.path).toBe("flow.line.4");
  });

  it("refuses a label used twice", () => {
    const { accepted } = build([
      "step warn: click save",
      "  node: web.dom.click",
      "  selector: [data-testid=save]",
      "step warn: click cancel",
      "  node: web.dom.click",
      "  selector: [data-testid=cancel]"
    ].join("\n"));

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(codes(accepted.issues)).toContain("flow_script.duplicate_label");
    expect(accepted.issues[0]?.message).toContain("warn");
  });

  it("refuses a port the node does not declare, listing the ports it does", () => {
    const { accepted } = build([
      "step save: click save",
      "  node: web.dom.click",
      "  selector: [data-testid=save]",
      "  on maybe: go to warn",
      "step warn: read the warning",
      "  node: web.dom.wait_for_text",
      "  text: Could not save"
    ].join("\n"));

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(codes(accepted.issues)).toContain("flow_script.unknown_port");
    expect(accepted.issues[0]?.message).toContain("success, failed");
  });
});
