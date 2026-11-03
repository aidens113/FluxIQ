/**
 * Which of a project build's agents a step is made by: the supervisor, a
 * subflow builder or a repair agent with the brief it works on, or the
 * validator. Absent on a build with one agent. Mirrors the activity stream's
 * agent (`ClientGatewayActivityAgent`); `llm/` imports nothing from
 * `activity/`, so `project-agents/attribution/` sets both.
 */
export type AutomationStudioLlmStepLogAgent = { role: "supervisor" | "builder" | "repair" | "validator"; briefId?: string };
