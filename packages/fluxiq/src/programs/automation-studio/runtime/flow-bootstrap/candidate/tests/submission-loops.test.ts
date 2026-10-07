// A candidate submission meets the loop and binding checks a drafted plan
// meets (t346). No draft stands behind a candidate, so the submission asks them
// of the submitted graph: a loop written as a script is accepted as the draft
// receipt any valid submission gets, and one the graph cannot honour is refused
// with the node and parameter it is about, and leaves no candidate.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition.id === "web.output.dom-click" ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition);
// A domain that permits what is declared: what is checked here is the loop, not the confirmation's grant.
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: { resolvePlanNodeParameters: async () => ({ status: "unchanged" as const }) }, permissionFor: () => async () => ({ permitted: true as const }) };

const REQUESTS = JSON.stringify({ item: ".request", fields: { name: ".who" } });
function laneD(text = "$row.name"): JsonObject {
  return {
    summary: "Confirm every friend request from a colleague",
    flow: [
      "flow: Confirm every friend request from a colleague",
      "step: open the requests",
      "  node: web.browser.navigate",
      "  url: https://social.test/friends/requests",
      "step requests: list the requests from colleagues",
      "  node: web.dom.extract_list",
      `  extractList: ${REQUESTS}`,
      "  extractList.minItems: 0",
      "step: confirm the request",
      "  node: web.dom.click",
      "  selector: .confirm",
      "  consequences: modify_existing",
      "  repeat over: requests",
      "  repeat through: confirmed",
      "step confirmed: check it was confirmed",
      "  node: web.dom.wait_for_text",
      `  text: ${text}`
    ].join("\n")
  };
}

describe("a candidate that repeats", () => {
  it("is accepted as a draft revision when its loop and bindings hold", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const submitted = await controller.submit(laneD());
    if (!submitted.ok) throw new Error(JSON.stringify(submitted.check));
    const nodes = submitted.candidate.buildPlan.plan.subflows[0]!.nodes;
    expect(nodes.map((node) => node.definitionId)).toContain("builtin.control.for-each");
    expect(nodes.find((node) => node.definitionId === "web.output.dom-wait_for_text")?.parameters?.text).toEqual({ $state: { path: "item.name" } });
    expect(submitted.candidate.status).toBe("draft");
  });

  it("is refused, naming the node and parameter, when a row field is one its listing does not read", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await controller.submit(laneD());
    expect(first.ok).toBe(true);
    const refused = await controller.submit(laneD("$row.colour"));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.check.issueCodes).toEqual(["flow_draft.row_binding_unknown_field"]);
    const issues = refused.check.feedback.issues as JsonObject[];
    expect(issues).toEqual([expect.objectContaining({ code: "flow_draft.row_binding_unknown_field", path: "plan.subflows.0.nodes.5.parameters.text" })]);
    expect(String(issues[0]!.message)).toContain("\"colour\"");
    // A refused revision leaves no candidate, and the earlier receipt is spent.
    expect(controller.latest()).toBeUndefined();
    if (first.ok) expect(controller.matches(first.candidate)).toBe(false);
  });

  it("is refused when a JSON plan closes a cycle through joins alone", async () => {
    const merge = registry.get("builtin.control.merge", resolution)!;
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const refused = await controller.submit({
      summary: "Press more for ever",
      plan: {
        schemaVersion: "0.1",
        router: { name: "loop", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
        subflows: [{
          key: "main", name: "Main", role: "primary",
          nodes: [
            { key: "open", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://shop.test" } },
            { key: "loop", definitionId: merge.id, definitionVersion: merge.version },
            { key: "press", definitionId: "web.output.dom-click", definitionVersion: "1.0.0", parameters: { selector: "a.more" }, consequences: ["none"] }
          ],
          edges: [
            { key: "e1", source: { nodeKey: "open", portId: "success" }, target: { nodeKey: "loop", portId: "branches" } },
            { key: "e2", source: { nodeKey: "loop", portId: "success" }, target: { nodeKey: "press", portId: "in" } },
            { key: "e3", source: { nodeKey: "press", portId: "success" }, target: { nodeKey: "loop", portId: "branches" } }
          ]
        }]
      }
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.check.issueCodes).toEqual(["flow_draft.loop_unbounded"]);
  });
});
