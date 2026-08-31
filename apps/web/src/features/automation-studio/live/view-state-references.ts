const MAX_AUTOMATION_VIEW_STATE_VISITS = 512;

export function automationViewStateReferencesAny(
  value: unknown,
  sourceIds: ReadonlySet<string>
): boolean {
  if (!sourceIds.size) return false;
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  let visits = 0;
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (sourceIds.has(current)) return true;
      continue;
    }
    if (current === null || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);
    visits += 1;
    // View state is expected to be compact. Drop an unexpectedly large state
    // conservatively instead of blocking deletion with unbounded traversal.
    if (visits > MAX_AUTOMATION_VIEW_STATE_VISITS) return true;
    if (Array.isArray(current)) pending.push(...current);
    else pending.push(...Object.values(current));
  }
  return false;
}
