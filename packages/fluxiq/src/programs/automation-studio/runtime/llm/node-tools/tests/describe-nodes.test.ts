// `core.describe_nodes`: the model asks for the definitions of the nodes it is
// about to use, and its result names them under `describedNodes` -- the request
// shows each definition there, in place of its id (t235; t289-G, W11).

import { describe, expect, it } from "vitest";
import { automationStudioActionPermissionDenied } from "../../../action-permissions/index.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import { automationStudioHarnessOptionIssues, automationStudioHarnessOptionTool } from "../../harness-options/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID, automationStudioLlmDescribeNodesBundle } from "../describe-nodes.ts";
import { automationStudioLlmNodeDescriptions } from "../node-descriptions.ts";

const resolution = { scope: { kind: "global" as const } };

function setup() {
  const memory = automationStudioLlmNodeDescriptions({ resolution });
  const bundle = automationStudioLlmDescribeNodesBundle(memory);
  const run = (value: Record<string, unknown>) => bundle.implementations[AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID]!({
    projectId: "p.1", flowId: "f.1", callId: "c.1", optionId: AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID, value: value as never, permission: automationStudioActionPermissionDenied
  });
  return { memory, bundle, run };
}

describe("core.describe_nodes", () => {
  it("is a valid Core observe option whose description fits its budget", () => {
    const { bundle } = setup();
    const [option] = bundle.options;
    expect(bundle.domainId).toBeUndefined();
    expect(option!.toolId).toBe("core.describe_nodes");
    expect(automationStudioHarnessOptionIssues(option!)).toEqual([]);
    expect(automationStudioLlmEvidenceValidTools([automationStudioHarnessOptionTool(option!)])).toBe(true);
    expect(option).toMatchObject({ effect: "observe", availability: { kind: "both" }, safety: { sideEffect: "observe" } });
    expect(option!.description.length).toBeLessThanOrEqual(400);
    expect(option!.description).toContain("under describedNodes in the result of the call that first described it");
    expect(option!.description).not.toContain("flowBootstrap.describedNodes");
    const ids = (option!.inputSchema.properties as { ids: Record<string, unknown> }).ids;
    expect(ids).toMatchObject({ type: "array", minItems: 1, maxItems: 64, uniqueItems: true, items: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,200}$" } });
    expect((ids.items as Record<string, unknown>).enum).toBeUndefined();
  });

  it("names the nodes it newly described, never their definitions, and remembers them", async () => {
    const { memory, run } = setup();
    const receipt = await run({ ids: ["builtin.logic.and", "builtin.logic.or"] });
    expect(receipt).toEqual({ ok: true, describedNodes: ["builtin.logic.and", "builtin.logic.or"] });
    expect(JSON.stringify(receipt)).not.toContain("emptyBehavior");
    expect(memory.ids()).toEqual(["builtin.logic.and", "builtin.logic.or"]);
  });

  it("says which were already described and which are unknown", async () => {
    const { run } = setup();
    await run({ ids: ["builtin.logic.and"] });
    expect(await run({ ids: ["builtin.logic.and", "builtin.logic.not", "web.output.nowhere"] })).toEqual({
      ok: true, describedNodes: ["builtin.logic.not"], alreadyDescribed: ["builtin.logic.and"], alreadyShown: "under describedNodes, earlier in this request", unknown: ["web.output.nowhere"]
    });
    // Nothing new described: nothing named, so the request shows no definition on this result.
    expect(await run({ ids: ["builtin.logic.and"] })).toEqual({ ok: true, alreadyDescribed: ["builtin.logic.and"], alreadyShown: "under describedNodes, earlier in this request" });
  });

  it("refuses a call naming only unknown nodes, as feedback the model can act on", async () => {
    const { memory, run } = setup();
    expect(await run({ ids: ["web.output.nowhere"] })).toEqual({
      kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "describe_nodes.unknown_nodes",
      evidence: { ok: false, code: "describe_nodes.unknown_nodes", unknown: ["web.output.nowhere"] }
    });
    expect(memory.ids()).toEqual([]);
  });

  it("refuses malformed input", async () => {
    const { run } = setup();
    for (const value of [{}, { ids: [] }, { ids: "builtin.logic.and" }, { ids: ["has space"] }, { ids: [3] }, { ids: ["builtin.logic.and"], extra: true }, { ids: Array.from({ length: 65 }, (_, i) => `n.${i}`) }]) {
      expect(await run(value), JSON.stringify(value)).toMatchObject({ resultCode: "harness_option.input_invalid", evidence: { ok: false, code: "harness_option.input_invalid" } });
    }
  });
});
