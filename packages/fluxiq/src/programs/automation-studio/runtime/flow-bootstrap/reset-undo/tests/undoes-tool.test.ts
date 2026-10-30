import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { automationStudioSiteResetUndoesTool } from "../undoes-tool.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../../site-reset/index.ts";

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

// Rerun round 3 (job `run-mvgo9wzn-fad4e050`): since t738 any reversible press
// made before the seal with no other witness needs a ref, not only create_new.
it("describes resetDestination for any reversible press before the first lasting change with no other witness", () => {
  const tool: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a registered operation.", effect: "mutate", perCallEffect: true, inputSchema: { type: "object", properties: { node: { type: "string" } } } };
  const described = String(((automationStudioSiteResetUndoesTool(tool, { createBaselines: true }).inputSchema.properties as JsonObject).resetDestination as JsonObject).description);
  expect(described).not.toMatch(/^For an identified reversible create_new/u);
  expect(described).toContain("any reversible lasting press (create_new, modify_existing or delete) made before the build's first lasting change");
  expect(described).toContain("no other witness");
  expect(described).toContain("on a later look that names it under undoes");
  expect(described).toContain("Never invent a ref");
  // t743 (photo r4, fix 2): the same clause as the build's guidance (`../../site-reset/words.ts`, `actionDeclarations`).
  expect(described).toContain(WORDS.ownUrl());
  expect(WORDS.actionDeclarations()).toContain(WORDS.ownUrl());
});
