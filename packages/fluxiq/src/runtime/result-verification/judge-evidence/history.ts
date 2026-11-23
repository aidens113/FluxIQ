/** Core's record that an earlier projection gap was repaired; never a domain success claim. */
export type AutomationStudioJudgeEvidenceHistory = {
  codes: string[];
  by: "original-source" | "source-replacement";
}[];

/** Closed, code-only metadata. No raw source or model-authored recovery instructions. */
export function automationStudioReadJudgeEvidenceHistory(value: unknown): AutomationStudioJudgeEvidenceHistory | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Array<AutomationStudioJudgeEvidenceHistory[number]> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
    const held = item as Record<string, unknown>;
    if (Object.keys(held).some((key) => key !== "codes" && key !== "by") || !Array.isArray(held.codes) || held.codes.length === 0 || held.codes.some((code) => typeof code !== "string" || !/^[a-z][a-z0-9_.:-]*$/.test(code))) return undefined;
    if (held.by !== "original-source" && held.by !== "source-replacement") return undefined;
    if (automationStudioResultEvidenceScreen({ codes: held.codes as string[] }, []).withheld) return undefined;
    result.push({ codes: [...held.codes] as string[], by: held.by });
  }
  return result;
}
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";

