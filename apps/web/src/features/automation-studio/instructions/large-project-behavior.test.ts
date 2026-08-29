import { describe, expect, it, vi } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { listFlowInstructions, readInstructionDirectoryUrlState, saveFlowInstruction } from "./index";

describe("Instructions large-project behavior", () => {
  it("keeps thousands of instructions behind a bounded directory request", async () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const api = { post: vi.fn().mockResolvedValue({
      ok: true,
      payload: { page: { instructions: fixture.instructions.slice(0, 50), limit: 50, offset: 0, total: fixture.instructions.length } }
    }) } as any;
    expect(readInstructionDirectoryUrlState({ limit: 50, offset: 2000 })).toMatchObject({ limit: 50, offset: 2000 });
    const result = await listFlowInstructions(api, { projectId: fixture.project.id, flowId: fixture.flows[0]!.flowId, limit: 50, offset: 0 });
    expect(result.payload?.page?.instructions).toHaveLength(50);
    expect(result.payload?.page?.total).toBe(2_048);
  });

  it("preserves permission errors from instruction mutations", async () => {
    const api = { post: vi.fn().mockResolvedValue({ ok: false, error: "instruction.manage permission required" }) } as any;
    await expect(saveFlowInstruction(api, { instructionId: "instruction.00000" })).resolves.toEqual({
      ok: false, error: "instruction.manage permission required"
    });
  });
});
