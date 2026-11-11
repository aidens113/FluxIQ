// How a tool's description may be overridden. Only the description: an input schema never.

/** Core's own tools. Any other tool id (a domain's) is append-only. */
export const FLUXNODE_CORE_TOOL_POLICIES: Readonly<Record<string, "open" | "append_only">> = Object.freeze({
  "core.run_node": "append_only",
  "core.run_flow": "open",
  "core.describe_nodes": "open",
  "core.recall_result": "open",
  "core.run_nodes": "open",
  "core.run_part": "open"
});
