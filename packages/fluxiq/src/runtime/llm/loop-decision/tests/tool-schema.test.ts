// The loop decision's own schema (t1096): its `result` is the completion's, and no call of it is offered what only a step takes.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { automationStudioLlmLoopDecisionTool } from "../tool.ts";

const completion: JsonObject = { type: "object", additionalProperties: false, required: ["rows"], properties: { rows: { type: "array", items: { type: "string" } } } };

describe("core.loop_decision's schema", () => {
  it("closes `result` with the completion's own schema, and leaves it open only where none is given", () => {
    expect((automationStudioLlmLoopDecisionTool(completion).inputSchema.properties as JsonObject).result).toEqual(completion);
    expect((automationStudioLlmLoopDecisionTool().inputSchema.properties as JsonObject).result).toEqual({ type: "object" });
  });

  it("is offered no act, place or add in the decision schema, though a node call is", () => {
    const run = { toolId: "core.run_node", description: "Runs.", effect: "mutate" as const, perCallEffect: true, inputSchema: { type: "object" } };
    const schema = buildAutomationStudioLlmEvidenceLoopDecisionSchema([run, automationStudioLlmLoopDecisionTool(completion)], completion, false, false, true);
    const keys = (schema.oneOf as JsonObject[]).map((variant) => Object.keys(variant.properties as JsonObject));
    expect(keys[0]).toEqual(expect.arrayContaining(["add", "act", "place"]));
    expect(keys[1]!.filter((key) => ["add", "act", "place"].includes(key))).toEqual([]);
  });

  it("leaves every core tool but the node library without act, place and add, so none is offered what only a step takes", () => {
    const run = { toolId: "core.run_node", description: "Runs.", effect: "mutate" as const, perCallEffect: true, inputSchema: { type: "object" } };
    const look = (toolId: string) => ({ toolId, description: "Looks.", effect: "observe" as const, inputSchema: { type: "object" } });
    const tools = [run, look("core.full_page"), look("core.set_result_processing"), look("web.press")];
    const schema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completion, false, false, true);
    const carried = (schema.oneOf as JsonObject[]).map((variant) => [((variant.properties as JsonObject).toolId as JsonObject).const, ["add", "act", "place"].filter((key) => key in (variant.properties as JsonObject)).length]);
    expect(carried).toEqual([["core.run_node", 3], ["core.full_page", 0], ["core.set_result_processing", 0], ["web.press", 3]]);
  });
});
