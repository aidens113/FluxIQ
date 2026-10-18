import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { automationStudioSiteResetUndoesTool } from "../undoes-tool.ts";

it("offers creation receipts only with the explicit project-builder option, retaining ordinary undo", () => {
  const tool: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a registered operation.", effect: "mutate", perCallEffect: true, inputSchema: { type: "object", properties: { node: { type: "string" } } } };
  const candidate = automationStudioSiteResetUndoesTool(tool);
  expect(candidate.inputSchema.properties).toHaveProperty("undoes");
  expect(candidate.inputSchema.properties).not.toHaveProperty("resetDestination");
  expect(candidate.description).not.toContain("resetDestination");
  const project = automationStudioSiteResetUndoesTool(tool, { createBaselines: true });
  expect(project.inputSchema.properties).toHaveProperty("undoes");
  const properties = project.inputSchema.properties as JsonObject;
  expect(properties.resetDestination).toMatchObject({ type: "string", pattern: "^destination-[1-9][0-9]{0,3}$" });
  expect((properties.resetDestination as JsonObject).description).toContain("resetDestinations.collections");
  expect(tool.inputSchema.properties).not.toHaveProperty("resetDestination");
  const other = { ...tool, toolId: "other.observe" };
  expect(automationStudioSiteResetUndoesTool(other, { createBaselines: true })).toBe(other);
});
