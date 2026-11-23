import type { AutomationStudioResultTrailStep } from "../contracts/index.ts";
import { readAutomationStudioResultEvidenceSourceRef, type AutomationStudioResultEvidenceSourceRef } from "../result-evidence/index.ts";

/** Bind only a producer event to its actual in-memory call, or an engine-unique batch key. */
export class AutomationStudioJudgeEvidenceOrigins {
  private static readonly calls = new WeakMap<object, AutomationStudioResultTrailStep>();

  static capture(call: object, step: AutomationStudioResultTrailStep): void {
    this.calls.set(call, step);
  }

  static recorded(trail: readonly AutomationStudioResultTrailStep[], refs: readonly AutomationStudioResultEvidenceSourceRef[], call?: object): void {
    const parsed = refs.map(readAutomationStudioResultEvidenceSourceRef);
    if (parsed.some((ref) => ref === undefined)) return;
    const sources = new Set(refs.map((ref) => ref.source));
    for (const source of sources) {
      const exact = call === undefined ? trail.filter((step) => step.callId === undefined && step.judgeSource?.source === source) : [this.calls.get(call)].filter((step): step is AutomationStudioResultTrailStep => step !== undefined);
      if (exact.length !== 1) continue;
      const step = exact[0]!;
      const capture = step.judgeSource;
      if (capture?.source !== source) continue;
      const matching = refs.filter((ref) => ref.source === capture.source && (capture.datasetId === undefined || ref.datasetId === capture.datasetId));
      if (matching.length !== 1 || refs.filter((ref) => ref.source === source).length !== 1) continue;
      // An origin is immutable. A reused call id cannot update an older step's version/dataset.
      if (step.judgeSources === undefined) step.judgeSources = structuredClone(matching);
    }
  }
}
