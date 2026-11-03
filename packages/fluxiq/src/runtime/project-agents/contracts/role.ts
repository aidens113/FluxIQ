// The model agents of a project build. The validator and the promotion owner
// are existing Core services, not agents, so they are not roles here.

export const AUTOMATION_STUDIO_PROJECT_AGENT_ROLES = Object.freeze(["supervisor", "builder", "repair"] as const);

export type AutomationStudioProjectAgentRole = (typeof AUTOMATION_STUDIO_PROJECT_AGENT_ROLES)[number];
