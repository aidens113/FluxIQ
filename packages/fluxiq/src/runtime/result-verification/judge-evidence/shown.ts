import { automationStudioJudgeEvidenceFinding } from "./finding.ts";

/** Reopen the semantic request form; an already projected value never goes back through a domain callback. */
export function automationStudioShownJudgeFinding(value: unknown, deniedKeys: readonly string[] | undefined): ReturnType<typeof automationStudioJudgeEvidenceFinding> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => key !== "role" && key !== "evidence" && key !== "missing")) return { ok: false, code: "judge_evidence.finding_invalid" };
  return automationStudioJudgeEvidenceFinding({ ...value, version: 1, missing: "missing" in value ? value.missing : [], withheld: false }, deniedKeys);
}
