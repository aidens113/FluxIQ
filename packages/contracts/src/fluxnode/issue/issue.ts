// What every FluxNode parser answers with: the value it built, or every reason it
// refused, each at the JSON Pointer (RFC 6901) of the part it refused.

/** A step into a value: an object key or an array index. */
export type FluxNodeIssuePath = Array<string | number>;

/**
 * One reason a value was refused.
 *
 * - `path`: a JSON Pointer into the value that was parsed, `""` for the value itself
 *   and `/scope/acts/0` for the first act of a spec's scope;
 * - `code`: a stable code such as `type_schema.unknown_keyword`, or zod's own code
 *   (`invalid_type`, `unrecognized_keys`, ...) for a plain shape error;
 * - `message`: a sentence for a person, saying what to write instead where it can.
 */
export type FluxNodeIssue = { path: string; code: string; message: string };

/** A parse that never throws: the value, or every issue, each listed once. */
export type FluxNodeParseResult<T> = { ok: true; value: T } | { ok: false; issues: FluxNodeIssue[] };

/** An issue whose path is still a list of steps, as a parser collects it before answering. */
export type FluxNodeRawIssue = { path: FluxNodeIssuePath; code: string; message: string };
