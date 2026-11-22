import type { AutomationStudioJudgeEvidenceProjector } from "../../llm/harness-options/index.ts";
import { automationStudioJudgeEvidenceFinding, type AutomationStudioJudgeEvidenceFinding } from "./finding.ts";
import { automationStudioProjectJudgeEvidence } from "./project.ts";

type Input = Parameters<AutomationStudioJudgeEvidenceProjector>[0];
type Options = { projectJudgeEvidence?: AutomationStudioJudgeEvidenceProjector | undefined; deniedEvidenceKeys: readonly string[] | undefined };
type Source = { input: Input; recovered?: AutomationStudioJudgeEvidenceFinding };

/** Exact original adapter inputs live only in memory. A durable/shown finding is never a replacement input. */
export class AutomationStudioJudgeEvidenceRetry {
  private static readonly sources = new WeakMap<object, Source>();

  static remember(step: object, input: Input): void {
    try { this.sources.set(step, { input: structuredClone(input) }); }
    catch { /* An input that cannot be copied supplies no retry authority. */ }
  }

  static carry(from: object, to: object): void {
    const source = this.sources.get(from);
    if (source !== undefined) this.sources.set(to, source);
  }

  static finding(step: object, prior: AutomationStudioJudgeEvidenceFinding, options: Options): AutomationStudioJudgeEvidenceFinding {
    if (Object.hasOwn(options, "judgeEvidenceVersion") && (options as { judgeEvidenceVersion?: unknown }).judgeEvidenceVersion !== 1) return prior;
    const source = this.sources.get(step);
    if (source?.recovered !== undefined) {
      const read = automationStudioJudgeEvidenceFinding(source.recovered, options.deniedEvidenceKeys);
      return read.ok ? read.finding : prior;
    }
    if (source === undefined || prior.missing.length === 0) return prior;
    const projected = automationStudioProjectJudgeEvidence(source.input, options.projectJudgeEvidence, options.deniedEvidenceKeys);
    if (projected.missing.length > 0 || projected.role === undefined) return prior;
    const recovered: AutomationStudioJudgeEvidenceFinding = { version: 1, ...projected, history: [...(prior.history ?? []), { codes: [...prior.missing], by: "original-source" }] };
    source.recovered = recovered;
    return recovered;
  }
}
