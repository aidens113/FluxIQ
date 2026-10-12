// An in-run repair's patch request fills the harness's typed `inRunRepair`
// slot (state-aware recovery plan, C6 step 8, C12): the unit by kind and id, its
// contract, the incident and what the run already tried and did. The slot, not
// the request's metadata, carries them, and brings the instruction that
// explains them. It rides on the patch request of the one recovery pipeline;
// the diagnosis before it carries none.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION } from "../../../llm/index.ts";
import { bindAutomationStudioInRunRepair } from "../../../service/runtime-session/index.ts";
import { IN_RUN_REPAIR_RUN_ID, inRunRepairGraph, inRunRepairRequest, inRunRepairWorld } from "../../../service/runtime-session/tests/in-run-repair-fixture.ts";
import { automationStudioInRunRepairSlot, automationStudioRepairUnitContract } from "../index.ts";

describe("the in-run repair request", () => {
  it("fills the patch request's typed slot with the unit, its contract, the incident and the history, and leaves none of it in metadata", async () => {
    const world = inRunRepairWorld();
    bindAutomationStudioInRunRepair({ context: world.context, graphOptions: world.graphOptions, ports: world.ports, runId: IN_RUN_REPAIR_RUN_ID });
    const answer = await world.graphOptions.repairIncident!(inRunRepairRequest());

    expect(answer.kind).toBe("overlay");
    expect(world.requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(world.requests[0]?.context.inRunRepair).toBeUndefined();
    const asked = world.requests[1]!;
    expect(asked.context.inRunRepair).toEqual({
      unit: { kind: "node", id: "read" },
      contract: { kind: "node", nodeId: "read", definitionId: "builtin.data.constant", label: "Read the list", parameters: { values: { value: "read" } }, routes: [{ port: "success", to: "end" }] },
      incident: { incidentId: "incident.1", origin: { framePath: ["frame.root"], nodeId: "read", failureCode: "test.target.not_found" }, handlersRun: [], routes: [], alternatives: [], trueFailure: true },
      failedAttempt: expect.objectContaining({ attemptId: "read.attempt.4", nodeId: "read", status: "failed", failure: { category: "target_not_found", code: "test.target.not_found", retryable: false } }),
      recoveriesTried: [expect.objectContaining({ kind: "retry", nodeId: "read", attemptNumber: 4 })],
      actsCompleted: [{ attemptId: "open.attempt.1", nodeId: "open", definitionId: "builtin.data.constant", framePath: ["frame.root"] }]
    });
    expect((asked.metadata as JsonObject).inRunRepair).toBeUndefined();
    expect((asked.metadata as JsonObject).allowedPatchKinds).toEqual(expect.arrayContaining(["add_handler", "replace_unit"]));
    expect(asked.context.instructions.instructionIds).toContain(AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.instructionId);
    expect(asked.promptVersion).toMatch(/\+stage\.implement\+in_run_repair$/u);
  });

  it("names a handler and a part by their own ids", () => {
    for (const [unit, id] of [[{ kind: "handler", handlerNodeId: "handler.notice" }, "handler.notice"], [{ kind: "part", subflowId: "subflow.list" }, "subflow.list"]] as const) {
      const request = inRunRepairRequest({ unit });
      const slot = automationStudioInRunRepairSlot({ request, contract: automationStudioRepairUnitContract({ graph: inRunRepairGraph(), unit }) });

      expect(slot.unit).toEqual({ kind: unit.kind, id });
      expect(slot.contract).toMatchObject({ kind: unit.kind, absent: true });
    }
  });
});
