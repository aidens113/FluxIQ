/**
 * Which build a step serves: the Flow's creation, or a re-author after a
 * playback run refuted its result. Each has its own cost ceiling. No part means
 * neither: a playback run, its result check and recovery, or the chat.
 */
export type AutomationStudioLlmStepLogPart = "creation" | "reauthor";
