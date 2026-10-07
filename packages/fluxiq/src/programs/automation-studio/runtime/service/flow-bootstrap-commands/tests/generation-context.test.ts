import { expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { candidateSourceFixture as fixture } from "../../candidate-drafts/tests/fixtures.ts";
import { automationStudioFlowBootstrapGenerationContext as context } from "../generation-context.ts";

function input() {
  return { projectId: "project.1", flowId: "flow.1", instructions: [fixture.instruction()],
    parent: { projectId: "project.1", flowId: "flow.1" } as AutomationStudioFlowArtifact,
    registry: new AutomationStudioNodeRegistry(), resolution: { scope: { kind: "domain" as const, domainId: "isolated" }, permissions: [], runtimeCapabilities: [] } };
}
it("explicit historical context stays unbound without owner inventory", () => {
  expect(context(input()).originalSource).toEqual({ status: "unknown", code: "candidate.original_inventory_unavailable" });
});
it("real generation context retains original fields/order/bytes from complete supplied owner set", () => {
  const request = input(), read = context({ ...request, originalInstructionInventory: { instructionIds: ["instruction.original"] } });
  expect(read.originalSource.status).toBe("bound");
  if (read.originalSource.status !== "bound") throw new Error("Missing source fixture");
  expect(read.originalSource.binding.originalSources.instructions).toEqual(request.instructions);
  expect(read.bootstrapInstructionText).toBe(" Original title \nCreate a deterministic Start to End Flow.\nKeep every original clause.");
  request.instructions[0]!.body = "changed caller";
  expect(read.originalSource.binding.originalSources.instructions[0]?.body).not.toBe("changed caller");
});
it.each(["missing", "duplicate", "extra", "inactive"] as const)("refuses %s originals before any authoring entry", kind => {
  const request = input();
  const inventory = kind === "missing" ? ["instruction.original", "missing"] : kind === "duplicate" ? ["instruction.original", "instruction.original"] : ["instruction.original"];
  if (kind === "extra") request.instructions.push(fixture.instruction({ instructionId: "unlisted" }));
  if (kind === "inactive") request.instructions[0]!.status = "archived";
  expect(() => context({ ...request, originalInstructionInventory: { instructionIds: inventory } })).toThrow();
});
it("does not invoke an inventory accessor or accept supplied undefined", () => {
  let calls = 0;
  expect(() => context({ ...input(), get originalInstructionInventory() { calls++; return { instructionIds: ["instruction.original"] }; } })).toThrow();
  expect(calls).toBe(0);
  expect(() => context({ ...input(), originalInstructionInventory: undefined } as never)).toThrow();
});
