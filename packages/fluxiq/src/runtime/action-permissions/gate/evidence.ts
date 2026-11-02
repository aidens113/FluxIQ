

export function shownValue(execution: unknown): unknown {
  if (execution && typeof execution === "object" && !Array.isArray(execution) && (execution as { kind?: unknown }).kind === "llm_evidence_tool_execution") {
    return (execution as { evidence?: unknown }).evidence;
  }
  return execution;
}
