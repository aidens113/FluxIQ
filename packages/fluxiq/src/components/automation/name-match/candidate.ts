import type { AutomationStudioNameValueShape } from "./value-shape.ts";

/**
 * One name a written name may be resolved to: a node id, a parameter id, an
 * output id. `accepts` is optional because a caller often knows the names
 * without knowing what each one takes, and a caller that does know gets a
 * better answer for the same call.
 *
 * `accepts` admits an explicit `undefined` so a caller can pass a shape it
 * derived and may not have found, without building the object two ways.
 */
export type AutomationStudioNameCandidate = {
  id: string;
  /** What this candidate accepts, where the caller knows. */
  accepts?: AutomationStudioNameValueShape | undefined;
};
