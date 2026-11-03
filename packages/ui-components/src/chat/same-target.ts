import { sameThread } from "./same-thread.ts";
import type { ChatTarget } from "./target.ts";

/** True when `a` and `b` are the same target: the same thread, under the same name, about the same work. */
export function sameTarget(a: ChatTarget, b: ChatTarget): boolean {
  if (!sameThread(a, b)) return false;
  if (a.kind === "automation" && b.kind === "automation") return a.name === b.name;
  if (a.kind === "question" && b.kind === "question") return a.activityId === b.activityId && a.title === b.title;
  return true;
}
