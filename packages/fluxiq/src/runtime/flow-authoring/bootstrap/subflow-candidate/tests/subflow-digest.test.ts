import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { automationStudioSubflowProposalDigest } from "../index.ts";

const subflows: AutomationStudioFlowBootstrapSubflow[] = [{ key: "find_listing", name: "Find", role: "primary", nodes: [{ key: "s1", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://listings.test/all" } }], edges: [] }];
const base = {
  scope: { buildId: "build.1", briefId: "brief-1", planDigest: "plan.digest.1", subflowKey: "find_listing" },
  projectId: "project.test", flowId: "flow.test", baseDependencyDigest: "accepted.base", instructionText: "Find the listings", subflows
};

describe("a scoped proposal's digest", () => {
  it("is stable for the same inputs, whatever their key order", () => {
    const reordered = { ...base, scope: { subflowKey: "find_listing", planDigest: "plan.digest.1", briefId: "brief-1", buildId: "build.1" } };
    expect(automationStudioSubflowProposalDigest(reordered)).toBe(automationStudioSubflowProposalDigest(base));
    expect(automationStudioSubflowProposalDigest(base)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("changes with each scope field", () => {
    const digest = automationStudioSubflowProposalDigest(base);
    for (const field of ["buildId", "briefId", "planDigest", "subflowKey"] as const) {
      expect(automationStudioSubflowProposalDigest({ ...base, scope: { ...base.scope, [field]: `${base.scope[field]}.other` } }), field).not.toBe(digest);
    }
  });

  it("changes with each of today's fingerprint inputs and with the graph", () => {
    const digest = automationStudioSubflowProposalDigest(base);
    for (const field of ["projectId", "flowId", "baseDependencyDigest", "instructionText"] as const) {
      expect(automationStudioSubflowProposalDigest({ ...base, [field]: `${base[field]}.other` }), field).not.toBe(digest);
    }
    const moved = [{ ...subflows[0]!, nodes: [{ ...subflows[0]!.nodes[0]!, parameters: { url: "https://listings.test/other" } }] }];
    expect(automationStudioSubflowProposalDigest({ ...base, subflows: moved })).not.toBe(digest);
  });
});
