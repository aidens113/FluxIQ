/** A class name: letters and digits only, so no message text can pass for one. */
const NAME = /^[A-Za-z][A-Za-z0-9]{0,47}$/u;
/** A machine code: `workspaces.busy`, `ENOENT`, `environments_pending`. Never free text. */
const CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u;
/** A message that starts with a dotted code (`workspaces.close_failed: ...`) gives that code and nothing after it. */
const MESSAGE_CODE = /^([a-z][a-z0-9_]*\.[a-z0-9_]+)(?::|$)/u;

/**
 * What kind of failure an unexpected error is, for the operator's log: its
 * class name and its machine code (an `code` property, or the dotted code a
 * message starts with), then the same for its `cause` and for each error an
 * `AggregateError` holds (the first three). Nothing else of the error is
 * read: never its message, stack or fields, which may carry request data.
 */
export function failureKind(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return typeof error;
  const name = NAME.test(error.name) ? error.name : "Error";
  const own = (error as { code?: unknown }).code;
  const code = typeof own === "string" && CODE.test(own) ? own : MESSAGE_CODE.exec(error.message)?.[1] ?? null;
  let kind = code === null ? name : `${name}:${code}`;
  if (depth >= 2) return kind;
  if (error instanceof AggregateError) {
    const inner = [...error.errors].slice(0, 3).map((entry) => failureKind(entry, depth + 1));
    if (inner.length > 0) kind += `[${inner.join("+")}${error.errors.length > 3 ? "+..." : ""}]`;
  }
  if (error.cause !== undefined) kind += `<${failureKind(error.cause, depth + 1)}`;
  return kind;
}
