/**
 * Which part of a build a step belongs to, as the build's phases set it.
 * `read` is the build's reading of its instructions, made outside any round.
 */
export type AutomationStudioLlmStepLogPhase = "explore" | "repair" | "test" | "read";
