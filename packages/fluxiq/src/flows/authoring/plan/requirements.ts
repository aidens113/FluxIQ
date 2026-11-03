/**
 * The capability ids a Flow declares under `metadata.requires` (contract C10)
 * when it uses a handler, a part call, or a fact a run observes on the page.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS = {
  handlers: "flow.handlers@1",
  subflowCalls: "flow.subflow-calls@1",
  facts: "web.facts@1"
} as const;
