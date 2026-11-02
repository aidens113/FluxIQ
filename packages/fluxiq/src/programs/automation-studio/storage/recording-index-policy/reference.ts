import type { RecordingReferenceReader } from "../../../../runtime/recording/indexing/index.ts";
import { parseAutomationStudioObjectContentRef } from "../object-store.ts";

export const automationStudioRecordingReferenceReader: RecordingReferenceReader = {
  accepts(reference, scope) {
    return parseAutomationStudioObjectContentRef(reference)?.projectId === scope.projectId;
  },
  validate(reference, scope) {
    const parsed = parseAutomationStudioObjectContentRef(reference);
    if (!parsed) {
      return { ok: false, code: "invalid_object_ref", message: `Object reference is not an Automation Studio content ref: ${reference}` };
    }
    if (parsed.projectId !== scope.projectId) {
      return { ok: false, code: "cross_project_ref", message: `Object reference points to project ${parsed.projectId}, expected ${scope.projectId}.` };
    }
    return { ok: true };
  }
};
