/** Private coverage warning, with no raw values, outcome claims or persisted clearing authority. */
export type AutomationStudioAnswerFirstJudgeEvidenceIssue = { version: 1; receipt: string; revision: number; code: "checkpoint_conflict" | "checkpoint_rejected" | "checkpoint_issue_invalid"; recoveredAtRevision?: number };

export function readAutomationStudioAnswerFirstJudgeEvidenceIssue(value: unknown): AutomationStudioAnswerFirstJudgeEvidenceIssue | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as Record<string, unknown>;
  if (held.version !== 1 || typeof held.receipt !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(held.receipt) || typeof held.revision !== "number" || !Number.isSafeInteger(held.revision) || held.revision < 0 || !["checkpoint_conflict", "checkpoint_rejected", "checkpoint_issue_invalid"].includes(held.code as string) || Object.keys(held).some((key) => !["version", "receipt", "revision", "code", "recoveredAtRevision"].includes(key))) return undefined;
  if (Object.hasOwn(held, "recoveredAtRevision") && (typeof held.recoveredAtRevision !== "number" || !Number.isSafeInteger(held.recoveredAtRevision) || held.recoveredAtRevision <= held.revision)) return undefined;
  return { version: 1, receipt: held.receipt, revision: held.revision, code: held.code as AutomationStudioAnswerFirstJudgeEvidenceIssue["code"], ...(typeof held.recoveredAtRevision === "number" ? { recoveredAtRevision: held.recoveredAtRevision } : {}) };
}
