import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, RecordingSession, TimelineEntry } from "../../../model/index.ts";
import { AutomationInstructionError } from "./error.ts";
import { supportingRecordingStepsJson } from "./recording-steps.ts";

/** A closed supporting projection: the steps carry each control's label and role only (`./recording-steps.ts`), never recorded values, addresses, browser state or an executable trace. */
export async function supportingAutomationRecordings(projectId: string, instructions: readonly Pick<AutomationStudioFlowInstruction, "linkedRecordingIds">[], read: (recordingId: string) => Promise<RecordingSession>, operation?: (domainId: string, entry: TimelineEntry) => string | undefined): Promise<JsonObject[]> {
  const ids = [...new Set(instructions.flatMap(instruction => instruction.linkedRecordingIds ?? []))];
  if (ids.length > 20) throw new AutomationInstructionError("recording.supporting_evidence_invalid");
  return await Promise.all(ids.map(async recordingId => {
    const recording = await read(recordingId);
    if (recording.metadata.projectId !== projectId || !Number.isFinite(recording.endedAt) || typeof recording.description !== "string" || !recording.description.trim() || recording.description.trim().length > 4000) throw new AutomationInstructionError("recording.supporting_evidence_invalid");
    const canonical = recording.timeline.filter(entry => entry.type === "action");
    const actions = canonical.length ? canonical : recording.timeline.filter(entry => entry.type === "domain_event");
    const domainId = recording.environment.domainId;
    const methods = actions.flatMap(entry => {
      const method = typeof domainId === "string" ? operation?.(domainId, entry) : undefined;
      return method ? [method] : [];
    });
    return { recordingId, method: methods.slice(0, 100), methodTruncated: methods.length > 100, description: recording.description.trim(), authority: "untrusted_supplementary_demonstration", actionCount: methods.length, ...supportingRecordingStepsJson(recording.timeline) };
  }));
}
