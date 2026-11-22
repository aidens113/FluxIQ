import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

/** The explicit format discriminator is strict; unsupported metadata cannot turn into legacy raw evidence. */
export function automationStudioReadJudgeEvidenceFormat(value: unknown): AutomationStudioRunResultSummary["evidenceProjection"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as Record<string, unknown>;
  if (held.version !== 1 || !Array.isArray(held.missing) || Object.keys(held).some((key) => key !== "version" && key !== "missing")) return undefined;
  const missing: Array<{ source: string; codes: string[] }> = [];
  for (const item of held.missing) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
    const gap = item as Record<string, unknown>;
    if (typeof gap.source !== "string" || !Array.isArray(gap.codes) || gap.codes.some((code) => typeof code !== "string" || !/^[a-z][a-z0-9_.:-]*$/.test(code)) || Object.keys(gap).some((key) => key !== "source" && key !== "codes")) return undefined;
    missing.push({ source: gap.source, codes: [...gap.codes] as string[] });
  }
  return { version: 1, missing };
}
