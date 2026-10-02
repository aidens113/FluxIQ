import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapCatalogNames } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import { packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput } from "../index.ts";

// t235: an evidence decision is shown every node by name and, in full, only the
// nodes the build asked `core.describe_nodes` about. The packet keeps the whole
// catalog for the readers that check it; what it adds is the names and the
// described entries, for an evidence decision only.

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };

function decision(describedNodeIds?: readonly string[]): AutomationStudioLlmHarnessInput {
  return {
    taskKind: "evidence_tool_decision",
    projectId: "project.one",
    flowId: "flow.one",
    instructions: [],
    evidenceLoop: { iteration: 1, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
    flowBootstrap: { registry, resolution, ...(describedNodeIds ? { describedNodeIds } : {}) }
  };
}

describe("the catalog an evidence decision's packet carries", () => {
  it("keeps the whole catalog and its selection, and adds every node by name", () => {
    const packet = packAutomationStudioLlmContext(decision());
    const bootstrap = packet.flowBootstrap!;

    expect(bootstrap.nodeCatalog.length).toBeGreaterThan(3);
    expect(bootstrap.catalogTruncated).toBe(false);
    expect(bootstrap.catalogSelection.usedBytes).toBe(Buffer.byteLength(JSON.stringify(bootstrap.nodeCatalog), "utf8"));
    expect(bootstrap.catalogNames).toEqual(automationStudioFlowBootstrapCatalogNames(bootstrap.nodeCatalog));
    // Nothing was described yet, so the field is absent rather than empty.
    expect("describedNodes" in bootstrap).toBe(false);
  });

  it("carries the described nodes whole, in first-described order, skipping an id the catalog does not hold", () => {
    const catalog = packAutomationStudioLlmContext(decision()).flowBootstrap!.nodeCatalog;
    const [first, second] = [catalog[2]!, catalog[0]!];
    const packet = packAutomationStudioLlmContext(decision([first.id, "web.no-such-node", second.id]));

    expect(packet.flowBootstrap!.describedNodes).toEqual([first, second]);
  });

  it("adds neither to a one-shot build, whose packet is unchanged", () => {
    const { evidenceLoop: _loop, ...rest } = decision([registry.list(resolution)[0]!.id]);
    const packet = packAutomationStudioLlmContext({ ...rest, taskKind: "flow_bootstrap" });

    expect(Object.keys(packet.flowBootstrap!)).toEqual(["outputSchema", "nodeCatalog", "catalogTruncated", "catalogSelection"]);
  });
});
