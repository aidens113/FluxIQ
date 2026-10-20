// Core's own arrivals are framed as Core's move (`../start-check.ts`, t743).
// Office rerun round 4 (`run-mvgvyaip-d856e135`, 0090-0127): Core's look at a
// stale list's place went through the domain's rule for the model's calls and
// was refused unrun. Here every arrival goes through a real registry binding,
// and the domain's implementation reads the frame as a domain does.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioHarnessOptionRegistry, automationStudioEvidenceBuildScope, type AutomationStudioEvidenceBuildScope, type AutomationStudioHarnessOptionBundle } from "../../../llm/index.ts";
import { AutomationStudioSiteResetStartCheck } from "../index.ts";

// A domain with nothing of the web in it: a reading list whose one node goes to a shelf.
const DOMAIN_ID = "reading-list";
const arrival = { node: "shelf.go", parameters: { to: "start" }, consequences: [] };

function bound(): { seen: Array<{ callId: string; scope: AutomationStudioEvidenceBuildScope | undefined }>; check: AutomationStudioSiteResetStartCheck; executeTool: (call: { callId: string; toolId: string; value: JsonObject }) => Promise<unknown> } {
  const seen: Array<{ callId: string; scope: AutomationStudioEvidenceBuildScope | undefined }> = [];
  const bundle: AutomationStudioHarnessOptionBundle = {
    schemaVersion: "0.1",
    domainId: DOMAIN_ID,
    options: [{
      toolId: "core.run_node",
      description: "Run a node.",
      inputSchema: { type: "object", additionalProperties: true, properties: {} },
      effect: "mutate",
      perCallEffect: true,
      initialObservation: { input: { node: "shelf.look", parameters: {}, consequences: [] }, arrival },
      availability: { kind: "domain", domainId: DOMAIN_ID },
      safety: { sideEffect: "mutate" }
    }],
    implementations: {
      "core.run_node": async ({ callId }) => {
        // Read after an await, as a domain reads it deep in its own work.
        await Promise.resolve();
        seen.push({ callId, scope: automationStudioEvidenceBuildScope() });
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true };
      }
    }
  };
  const binding = new AutomationStudioHarnessOptionRegistry().register(bundle).evidenceLoopBinding(
    { projectId: "p1", flowId: "f1", buildId: "build.one" },
    { scope: { kind: "domain", domainId: DOMAIN_ID }, allowSideEffectsWithoutPolicy: true }
  );
  const domain = {
    startState: async () => ({ state: { shelf: 1 }, differs: [], location: "https://reading-list.test/shelf" }),
    runsNodes: { arrival: { node: "shelf.go", parameter: "to" } }
  } as unknown as ConstructorParameters<typeof AutomationStudioSiteResetStartCheck>[0]["binding"];
  const executeTool = (call: { callId: string; toolId: string; value: JsonObject }) => binding.executeTool(call);
  const check = new AutomationStudioSiteResetStartCheck({ binding: domain, projectId: "p1", flowId: "f1", tools: binding.tools, executeTool });
  return { seen, check, executeTool };
}

describe("Core's own arrivals in the frame a domain reads", () => {
  it("frames a look, a comparison at an act's page and one at the start as Core's move", async () => {
    const { seen, check } = bound();
    await check.capture();
    await check.lookAt("https://reading-list.test/wishlist");
    await check.compareAt({ state: { shelf: 1 }, location: "https://reading-list.test/book/7", changed: [] });
    await check.compare();
    expect(seen.map((entry) => [entry.callId, entry.scope?.move])).toEqual([
      ["site-reset.look.1.arrival", "core"],
      ["site-reset.place.2.arrival", "core"],
      ["site-reset.1.arrival", "core"]
    ]);
    expect(seen[0]?.scope).toEqual({ projectId: "p1", flowId: "f1", buildId: "build.one", move: "core" });
  });

  it("never frames a call the model wrote, even one shaped like Core's look, and leaves nothing behind after a look", async () => {
    const { seen, check, executeTool } = bound();
    await executeTool({ callId: "site-reset.look.9.arrival", toolId: "core.run_node", value: { node: "shelf.go", parameters: { to: "https://reading-list.test/wishlist" }, consequences: [] } });
    await check.lookAt("https://reading-list.test/wishlist");
    await executeTool({ callId: "call.2", toolId: "core.run_node", value: { node: "shelf.go", parameters: { to: "https://reading-list.test/wishlist" }, consequences: [] } });
    expect(seen.map((entry) => [entry.callId, entry.scope?.move])).toEqual([
      ["site-reset.look.9.arrival", undefined],
      ["site-reset.look.1.arrival", "core"],
      ["call.2", undefined]
    ]);
    expect(seen[0]?.scope).not.toHaveProperty("move");
  });

  it("keeps a model call running beside Core's look unframed", async () => {
    const { seen, check, executeTool } = bound();
    await Promise.all([
      check.lookAt("https://reading-list.test/wishlist"),
      executeTool({ callId: "call.1", toolId: "core.run_node", value: { node: "shelf.go", parameters: { to: "start" }, consequences: [] } })
    ]);
    expect(Object.fromEntries(seen.map((entry) => [entry.callId, entry.scope?.move ?? "model"]))).toEqual({ "site-reset.look.1.arrival": "core", "call.1": "model" });
  });
});
