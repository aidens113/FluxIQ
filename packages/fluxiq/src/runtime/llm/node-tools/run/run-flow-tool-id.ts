// The id of the tool that runs part of the Flow again (`./flow.ts`), in a module
// of its own with no imports: a reader of that tool's answers
// (`../../decision-handlers/replay-facts.ts`, t973) needs the id and nothing else,
// and the tool's own module leads back to the loop that reads it.

/** The tool that runs part of the Flow. */
export const AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID = "core.run_flow";
