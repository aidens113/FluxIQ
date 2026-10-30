
/**
 * A tool call naming a tool this decision did not offer. It used to end the
 * loop as `llm_evidence_loop.unknown_tool`; it is now refused and asked again,
 * with the offered ids and the nearest one (`../../unusable-decision.ts`), and
 * counts toward the no-progress guard like any other refusal. A loop that
 * cannot ask again (no `unusableDecisions`) still ends on the closed code.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_UNKNOWN_TOOL_REFUSED_CODE = "llm_evidence_loop.unknown_tool_refused";
