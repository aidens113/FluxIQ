import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AutomationStudioBootstrapInstructionInventory as Inventory } from "../instruction-inventory.ts";

const artifact = (id: string): AutomationStudioFlowInstruction => ({ schemaVersion: "0.1", instructionId: id, title: "Original", body: "Exact original clause", scope: { kind: "flow", projectId: "project.original", flowId: "flow.original" }, status: "active", requirement: "required", priority: 1, createdAt: 1, updatedAt: 2 });
describe("strict candidate original owner inventory", () => {
  it("reads every owner page before filtering and retains detached exact originals", async () => {
    const originals = Array.from({ length: 201 }, (_, i) => artifact(`instruction.${i}`));
    const list = vi.fn(async ({ offset }: { offset: number }) => ({ instructions: originals.slice(offset, offset + 100), total: originals.length }));
    const result = await new Inventory({ list, get: async (_, id) => originals.find(original => original.instructionId === id)! }).read("project.original", "flow.original", true);
    expect(list.mock.calls.map(([request]) => request.offset)).toEqual([0, 100, 200]);
    expect(result.instructionIds).toHaveLength(201); expect(result.instructions).toHaveLength(201);
    originals[0]!.body = "Changed after read"; expect(result.instructions.find(original => original.instructionId === "instruction.0")?.body).toBe("Exact original clause");
  });
  it("missing, inactive or wrong original refuses instead of certifying survivors", async () => {
    for (const read of [null, { ...artifact("instruction.a"), status: "archived" }, artifact("instruction.other")]) {
      const inventory = new Inventory({ list: async () => ({ instructions: [{ instructionId: "instruction.a" }], total: 1 }), get: async () => read as AutomationStudioFlowInstruction | null });
      await expect(inventory.read("project.original", "flow.original", true)).rejects.toThrow("original_missing_or_changed");
    }
  });
  it("duplicate, truncated and changing page inventory cannot certify complete source", async () => {
    const get = vi.fn(async (_, id: string) => artifact(id));
    for (const page of [{ instructions: [{ instructionId: "a" }, { instructionId: "a" }], total: 2 }, { instructions: [], total: 1 }, { instructions: [{ instructionId: "a" }], total: 2 }]) {
      await expect(new Inventory({ list: async () => page, get }).read("project.original", "flow.original", true)).rejects.toThrow();
    }
    let calls = 0;
    await expect(new Inventory({ list: async () => ({ instructions: Array.from({ length: 100 }, (_, i) => ({ instructionId: `${calls}.${i}` })), total: ++calls === 1 ? 201 : 202 }), get }).read("project.original", "flow.original", true)).rejects.toThrow("inventory_changed");
    expect(get).not.toHaveBeenCalled();
  });
  it("explicit legacy reads retain deduplication and missing-original compatibility", async () => {
    const result = await new Inventory({ list: async () => ({ instructions: [{ instructionId: "a" }, { instructionId: "a" }, { instructionId: "missing" }], total: 3 }), get: async (_, id) => id === "a" ? artifact(id) : null }).read("project.original", "flow.original");
    expect(result.instructions.map(original => original.instructionId)).toEqual(["a"]);
    expect(result.instructionIds).toEqual(["a", "missing"]);
  });
});
