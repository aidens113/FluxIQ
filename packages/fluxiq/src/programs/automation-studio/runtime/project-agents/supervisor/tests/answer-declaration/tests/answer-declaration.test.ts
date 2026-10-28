// A part declares the answer it owes (t757, wired by t764): the plan's tool
// accepts `answer`, and the guidance tells the supervisor when to declare it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "../../../guidance.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../tool-ids.ts";
import { automationStudioProjectSupervisorTools } from "../../../tools.ts";

function partSchema(): JsonObject {
  const tool = automationStudioProjectSupervisorTools().find((candidate) => candidate.toolId === IDS.writePlan)!;
  const taskSpec = (tool.inputSchema.properties as JsonObject).taskSpec as JsonObject;
  const parts = (taskSpec.properties as JsonObject).parts as JsonObject;
  return parts.items as JsonObject;
}

describe("the plan tool's part schema", () => {
  it("accepts an optional answer of records with columns, and still takes nothing else", () => {
    const part = partSchema();
    const properties = part.properties as JsonObject;
    expect(properties.answer).toEqual({ type: "object", properties: { kind: { type: "string", enum: ["records"] }, columns: { type: "array", items: { type: "string" } } }, required: ["kind", "columns"], additionalProperties: false });
    expect(part.required).not.toContain("answer");
    expect(part.additionalProperties).toBe(false);
  });
});

describe("the supervisor's guidance on a part's answer", () => {
  it("tells it to declare answer for a part whose result is rows of values, in the plan's tool and in step 1", () => {
    expect(GUIDANCE.tools.writePlan).toContain("answer");
    expect(GUIDANCE.tools.writePlan).toContain("records");
    expect(JSON.stringify(GUIDANCE).split('answer: {kind: \\"records\\"').length - 1).toBe(2);
  });
});
