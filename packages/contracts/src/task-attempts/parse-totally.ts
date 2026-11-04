// The wrapper that makes a task-attempt parser total. Internal to this directory:
// not re-exported.

export type TaskAttemptParsed<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Runs `read` so it can never throw and never answers without saying why.
 * `read` adds stable codes to `issues` and answers null when it cannot build a
 * value; a thrown error, as from a getter on a hostile object, is `<prefix>.invalid`.
 */
export function parseTotally<T>(prefix: string, read: (issues: Set<string>) => T | null): TaskAttemptParsed<T> {
  const issues = new Set<string>();
  let value: T | null;
  try {
    value = read(issues);
  } catch {
    issues.add(`${prefix}.invalid`);
    value = null;
  }
  if (value === null || issues.size > 0) return { ok: false, issues: issues.size > 0 ? [...issues] : [`${prefix}.invalid`] };
  return { ok: true, value };
}
