/** The longest summary `index.md` carries. */
const MAX_SUMMARY = 100;

/**
 * One line of at most 100 characters saying what a step came to, for its row
 * in `index.md`: a decision's kind and tool, how many amendments, or that it
 * completed; a tool's result code, or `ok` / `refused`, and the check Core
 * refused its value under when it did not read it; a failure's code.
 */
export const automationStudioLlmStepLogSummary = {
  model(response: unknown, error: unknown): string {
    if (error !== undefined) return oneLine(`error ${codeOf(error) ?? "unknown"}`);
    const record = asRecord(response);
    const decision = asRecord(record?.decision);
    if (record?.kind === "evidence_tool_decision" && decision) {
      if (decision.kind === "tool_call") return oneLine(`tool_call ${typeof decision.toolId === "string" ? decision.toolId : "-"}${decision.add === true ? " add" : ""}`);
      if (decision.kind === "amend_draft") {
        const count = Array.isArray(decision.amendments) ? decision.amendments.length : 0;
        return oneLine(`amend_draft ${count} amendment${count === 1 ? "" : "s"}`);
      }
      return oneLine(String(decision.kind));
    }
    if (typeof record?.kind === "string") return oneLine(`${record.kind}${typeof record.summary === "string" ? `: ${record.summary}` : ""}`);
    if (typeof record?.content === "string") return oneLine(record.content);
    return "ok";
  },
  tool(evidence: unknown, resultCode: unknown, error: unknown, unread?: string | undefined): string {
    if (error !== undefined) return oneLine(`threw ${codeOf(error) ?? (error instanceof Error ? error.name : "non_error")}`);
    const said = typeof resultCode === "string" && resultCode ? resultCode : asRecord(evidence)?.ok === false ? "refused" : "ok";
    return oneLine(unread ? `${said}, unread: ${unread.replace(/^llm_evidence_loop\.tool_result_invalid\.?/u, "") || "invalid"}` : said);
  }
};

function codeOf(error: unknown): string | undefined {
  const code = asRecord(error)?.code;
  return typeof code === "string" ? code : undefined;
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > MAX_SUMMARY ? `${flat.slice(0, MAX_SUMMARY - 3)}...` : flat;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
