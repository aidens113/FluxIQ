import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioRequiredCommandRun } from "../index.ts";

// Why `command_execution.storage_required` stays in `../lifecycle.ts` although
// `runRuntimeSession` never reaches it (t558): the instruction gate refuses both
// of its cases first. A run with no project has no instructions, and on a
// service with no storage root the gate cannot even read the Flow, which could
// never have been stored there. The class keeps the rule a required run needs,
// whatever its caller checks first.

const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.storage-less", ownerKind: "routine", ownerId: "routine.synthetic", name: "Storage-less", createdAt: 1, updatedAt: 1, nodes: [], edges: [] };

describe("required command runs on a service with no storage", () => {
  it("are refused at the instruction gate before the storage rule, which still holds on its own", async () => {
    const service = new AutomationStudioService({ seedFixture: false });
    try {
      const project = await service.createProject({ name: "Storage-less" });
      await expect(service.createFlow({ projectId: project.id, flowId: flow.flowId, name: flow.name })).rejects.toThrow(/no storage root/);
      await expect(service.runRuntimeSession({ projectId: project.id, flow, commandOutcomeMode: "required" })).rejects.toThrow(/no storage root/);
      await expect(service.runRuntimeSession({ flow, commandOutcomeMode: "required" })).rejects.toMatchObject({ name: "AutomationInstructionError", code: "automation.instructions_required" });
      expect(() => new AutomationStudioRequiredCommandRun({ commandOutcomeMode: "required", projectId: project.id }, false)).toThrow("command_execution.storage_required");
      expect(() => new AutomationStudioRequiredCommandRun({ commandOutcomeMode: "required" }, true)).toThrow("command_execution.storage_required");
    } finally {
      await service.close();
    }
  });
});
