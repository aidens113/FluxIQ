import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { appendRecordingEntry, createRecordingSession } from "../../../../model/index.ts";
import { AutomationInstructionError, automationInstructionTasks, instructionBoundRunGate, requiredRecordingDescription, supportingAutomationRecordings } from "../index.ts";
import { AutomationStudioRunControlRegistry } from "../../../run-control/index.ts";

function task(): AutomationStudioFlowInstruction { return { schemaVersion: "0.1", instructionId: "task", title: "Written task", body: "Calculate the requested value.", scope: { kind: "flow", projectId: "p", flowId: "f" }, priority: 50, status: "active", requirement: "advisory", createdAt: 1, updatedAt: 1 }; }

describe("explicit instruction authority", () => {
  it("preserves legitimate legacy advisory Flow task without a new origin marker", () => { expect(automationInstructionTasks([task()], "p", "f")).toHaveLength(1); });
  it.each(["blank", "inactive", "other_owner", "project", "global", "model", "recording", "argument", "safety"])("does not accept %s as task authority", row => {
    const instruction = task();
    if (row === "blank") instruction.body = "  ";
    if (row === "inactive") instruction.status = "disabled";
    if (row === "other_owner") instruction.scope = { kind: "flow", projectId: "p", flowId: "other" };
    if (row === "project") instruction.scope = { kind: "project", projectId: "p" };
    if (row === "global") instruction.scope = { kind: "global" };
    if (row === "model") instruction.metadata = { source: "model_suggestion" };
    if (row === "recording") instruction.metadata = { source: "recording_inference" };
    if (row === "argument") instruction.metadata = { source: "conversation_argument" };
    if (row === "safety") instruction.tags = ["safety"];
    expect(automationInstructionTasks([instruction], "p", "f")).toEqual([]);
  });
  it("description does not become an instruction or method payload", async () => {
    const recording = appendRecordingEntry(createRecordingSession({ recordingId: "r", description: "Demonstrates a generic operation.", initialState: { timestamp: 1, namespaces: {} }, environment: { domainId: "generic" }, metadata: { projectId: "p" } }), { type: "action", actionType: "operate", outputId: "operate", startedAt: 2, origin: "operator", parameters: { privateValue: "not model context" } });
    recording.endedAt = 3;
    const projected = await supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording, (_domain, entry) => entry.type === "action" ? entry.outputId : undefined);
    expect(projected).toEqual([{ recordingId: "r", description: "Demonstrates a generic operation.", authority: "untrusted_supplementary_demonstration", actionCount: 1, method: ["operate"], methodTruncated: false }]);
    expect(automationInstructionTasks([], "p", "f")).toEqual([]);
  });
  it.each(["open", "other_project", "undescribed"])("declines %s supporting evidence", async row => {
    const recording = createRecordingSession({ recordingId: "r", description: "Demonstrates one operation.", initialState: { timestamp: 1, namespaces: {} }, metadata: { projectId: row === "other_project" ? "q" : "p" } });
    if (row !== "open") recording.endedAt = 2;
    if (row === "undescribed") delete recording.description;
    await expect(supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => recording)).rejects.toMatchObject({ code: "recording.supporting_evidence_invalid" });
  });
  it("propagates referenced recording read errors", async () => { await expect(supportingAutomationRecordings("p", [{ linkedRecordingIds: ["r"] }], async () => { throw new Error("storage_unavailable"); })).rejects.toThrow("storage_unavailable"); });
  it.each([undefined, "", " ", "x".repeat(4001)])("requires explicit nonblank bounded new descriptions", value => { expect(() => requiredRecordingDescription(value)).toThrow(AutomationInstructionError); });
  it("a direct registry resume cannot bypass current authority", async () => {
    const registry = new AutomationStudioRunControlRegistry();
    const control = registry.open("p", "r");
    registry.pause("p", "r");
    const verify = vi.fn().mockRejectedValue(new AutomationInstructionError("automation.instructions_required"));
    const gate = instructionBoundRunGate(control, verify);
    const waiting = gate.checkpoint({ nodeId: "next", step: 2 });
    const answer = expect(waiting).rejects.toMatchObject({ code: "automation.instructions_required" });
    registry.resume("p", "r");
    await answer;
    expect(verify).toHaveBeenCalledOnce();
    registry.close("p", "r");
  });
});
