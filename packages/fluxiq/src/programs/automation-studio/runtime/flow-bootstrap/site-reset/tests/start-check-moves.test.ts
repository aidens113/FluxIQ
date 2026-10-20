// The start check counts every time it moved the target (`../start-check.ts`,
// t738). Office rerun round 2 (`run-mvgf04kw-310fc169`, 0126 and 0159): Core's
// own look at a stale witness's place moved the tab before a refused trial, and
// nothing said so.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AutomationStudioSiteResetStartCheck } from "../index.ts";

const arrival = { node: "demo.go", parameters: { to: "start" }, consequences: [] };
const runNode: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] }, arrival } };

function check(effectApplied: (callId: string) => boolean) {
  const binding = {
    startState: async () => ({ state: { shelf: 1 }, differs: [], location: "https://reading-list.test/shelf" }),
    runsNodes: { arrival: { node: "demo.go", parameter: "to" } }
  } as unknown as ConstructorParameters<typeof AutomationStudioSiteResetStartCheck>[0]["binding"];
  const executeTool = async (call: { callId: string; toolId: string; value: JsonObject }) => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: effectApplied(call.callId) });
  return new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool });
}

describe("the moves a start check counts", () => {
  it("counts Core's own look at a place, a comparison at an act's page and one at the start", async () => {
    const start = check(() => true);
    await start.capture();
    expect(start.moves).toBe(0);
    await start.lookAt("https://reading-list.test/wishlist");
    expect(start.moves).toBe(1);
    await start.compareAt({ state: { shelf: 1 }, location: "https://reading-list.test/book/7", changed: [] });
    expect(start.moves).toBe(2);
    await start.compare();
    expect(start.moves).toBe(3);
  });

  it("counts nothing for an arrival that applied no effect, or a read in place", async () => {
    const still = check(() => false);
    await still.capture();
    await still.lookAt("https://reading-list.test/wishlist");
    await still.compare();
    await still.read();
    expect(still.moves).toBe(0);
  });
});
