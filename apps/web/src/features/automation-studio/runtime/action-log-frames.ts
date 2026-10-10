/**
 * Where each row of a run log page sits (Core's state-aware recovery plan, C1):
 * a called part's steps follow the Call Subflow row that ran them, each naming
 * it as `parentAttemptId`, and are drawn under it, one level deeper per part.
 *
 * - `depth`: 0 for the Flow's own steps, 1 for a part's, 2 for a part that part
 *   called, and so on. A part's row whose call is on an earlier page has no
 *   row on this page to count from, so its depth is its frame path's (the
 *   invocations outermost first, the Flow's own frame among them), at least 1.
 * - `part`: on the first row of each run of a part's steps on this page, the
 *   id of the part they belong to (the call row's `subflowTarget.subflowId`),
 *   so the log can head the group with the part's name. `continued` says the
 *   group's call row is on an earlier page, so the part is not known here.
 * - `calls`: on a Call Subflow row, the id of the part it ran.
 */
export type RuntimeRunLogFrame = { depth: number; part?: string; continued?: boolean; calls?: string };

export function runtimeRunLogFrames(attempts: readonly unknown[]): RuntimeRunLogFrame[] {
  const placed = new Map<string, { depth: number; parent?: string; calls?: string }>();
  // Whether `ancestorId` is `attemptId` or a call it ran inside, among the rows already placed.
  const within = (attemptId: string | undefined, ancestorId: string): boolean => {
    for (let id = attemptId; id !== undefined; id = placed.get(id)?.parent) if (id === ancestorId) return true;
    return false;
  };
  let previousParent: string | undefined;
  return attempts.map((attempt) => {
    const row = isRecord(attempt) ? attempt : {};
    const attemptId = typeof row.attemptId === "string" ? row.attemptId : undefined;
    const parentId = typeof row.parentAttemptId === "string" && row.parentAttemptId ? row.parentAttemptId : undefined;
    const target = isRecord(row.subflowTarget) && typeof row.subflowTarget.subflowId === "string" && row.subflowTarget.subflowId ? row.subflowTarget.subflowId : undefined;
    const parent = parentId === undefined ? undefined : placed.get(parentId);
    const depth = parentId === undefined ? 0 : parent ? parent.depth + 1 : Math.max(1, framePathDepth(row.framePath));
    // A group starts at a part's first row here, unless the row before it was this part's too
    // (a nested part's last step, back in the outer part, keeps the outer part's group).
    const startsGroup = parentId !== undefined && !within(previousParent, parentId);
    previousParent = parentId;
    if (attemptId !== undefined) placed.set(attemptId, { depth, ...(parentId ? { parent: parentId } : {}), ...(target ? { calls: target } : {}) });
    return {
      depth,
      ...(startsGroup && parent?.calls ? { part: parent.calls } : {}),
      ...(startsGroup && !parent ? { continued: true } : {}),
      ...(target ? { calls: target } : {})
    };
  });
}

function framePathDepth(value: unknown): number {
  return Array.isArray(value) ? value.length - 1 : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
