// Which input port an edge the script did not name arrives at.
//
// A port that declares `role: "data"` carries a value -- a loop's current row
// -- and not the path. An edge reaches it only by naming it; an edge that
// names nothing takes a way in, or no port at all, exactly as it would on a
// node that declared no data input.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };

/** The web library, with the named nodes declaring the input a loop hands its row to. */
function registryWithRow(...ids: string[]): AutomationStudioNodeRegistry {
  return new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture().map((definition) => ids.includes(definition.id) ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition));
}

// The failure of `save` takes `warn`'s way in, so the step written before
// `warn` has nowhere left to fall into. With no data input that edge is
// dropped; with one, it must still be dropped rather than land on the row.
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

function wired(registry: AutomationStudioNodeRegistry): string[] {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: FAILURE_BRANCH }, registry, resolution });
  if (!accepted.ok) throw new Error(`The script was refused: ${accepted.issues.map((issue) => issue.code).join(", ")}`);
  return accepted.plan.subflows[0]!.edges.map((edge) => `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}:${edge.target.portId}`);
}

describe("an edge that names no input port", () => {
  it("never falls into a data input, and wires the Flow as if the node declared none", () => {
    const without = wired(registryWithRow());
    const withRow = wired(registryWithRow("web.output.dom-wait_for_text"));

    expect(withRow.filter((edge) => edge.endsWith(":item"))).toEqual([]);
    expect(withRow).toEqual(without);
    expect(withRow).toEqual(["s2:failed>s4:in", "s1:success>s2:in", "s2:success>s3:in"]);
  });
});
