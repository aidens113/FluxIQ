import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAutomationStudioLargeProjectFixture } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";

describe("AutomationStudioService instruction readiness summaries", () => {
  it("finds one active applicable instruction beyond an unfiltered 100-item page and reports none when all are inactive", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-instruction-readiness-"));
    const service = new AutomationStudioService({ dataDir: path.join(rootDir, ".fluxiq", "data"), seedFixture: false });
    try {
      const project = await service.createProject({ name: "Instruction readiness boundary" });
      const fixture = createAutomationStudioLargeProjectFixture({ projectId: project.id, flowCount: 1, subflowsPerFlow: 1, instructionsPerFlow: 102, runsPerFlow: 0, adaptationsPerFlow: 0, recordingCount: 0, nowMs: 10_000 });
      const flow = fixture.flows[0]!;
      const instructions = fixture.instructions.map((instruction) => ({
        ...instruction,
        scope: { kind: "flow" as const, projectId: project.id, flowId: flow.flowId }
      }));
      await service.saveFlow({ projectId: project.id, flow });
      for (const [index, instruction] of instructions.entries()) {
        await service.saveFlowInstruction(project.id, { ...instruction, status: index === 0 ? "active" : "disabled" });
      }

      const oldUnfilteredPage = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, limit: 100, offset: 0 });
      expect(oldUnfilteredPage).toMatchObject({ total: 102, limit: 100, offset: 0 });
      expect(oldUnfilteredPage.instructions.some((instruction) => instruction.status === "active")).toBe(false);
      const activePage = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, status: "active", limit: 1, offset: 0 });
      expect(activePage).toMatchObject({ total: 1, limit: 1, offset: 0 });
      expect(activePage.instructions).toEqual([expect.objectContaining({ instructionId: instructions[0]!.instructionId, status: "active" })]);

      await service.saveFlowInstruction(project.id, { ...instructions[0]!, status: "disabled" });
      await expect(service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, status: "active", limit: 1, offset: 0 })).resolves.toMatchObject({ instructions: [], total: 0, limit: 1, offset: 0 });
    } finally {
      await service.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
