import type { RuntimeAttemptStoryOptions } from "./story-line";

/** A wait in a person's words: "0.25 seconds", "1 second", "1.5 seconds", "2 minutes". */
export function runtimeWaitWords(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 6_000) / 10;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const seconds = ms >= 1_000 ? Math.round(ms / 100) / 10 : Math.max(0.01, Math.round(ms / 10) / 100);
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/** A step as the story names it: the caller's name for it, else its id in quotes. */
export function runtimeStepWords(nodeId: unknown, options: RuntimeAttemptStoryOptions = {}): string {
  if (typeof nodeId !== "string" || !nodeId) return "a step";
  const named = options.stepName?.(nodeId)?.trim();
  return named ? named : `“${nodeId}”`;
}

/** A called part as the story names it: the caller's name for it, else its id in quotes. */
export function runtimePartWords(subflowId: string, options: RuntimeAttemptStoryOptions = {}): string {
  const named = options.partName?.(subflowId)?.trim();
  return named ? named : `“${subflowId}”`;
}

/** A finite, non-negative number, or undefined: a record read back from storage is checked, not assumed. */
export function runtimeStoryNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The way an attempt left its step, for the row's route column: the two routes
 * the runtime itself names read as words, and an edge's own port name is shown
 * as the Flow names it.
 */
export function runtimeRouteWords(route: unknown): string {
  if (route === "skipped") return "Skipped";
  if (route === "state_routed") return "Moved on";
  return typeof route === "string" && route ? route : "-";
}
