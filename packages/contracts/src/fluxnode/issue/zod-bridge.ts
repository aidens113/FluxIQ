// The bridge between zod and FluxNode issues: run a zod schema and answer with
// FluxNode issues, and wrap a hand-written parser as a zod schema so it can sit inside
// a zod object. Exported for the sibling directories; the entry barrel does not
// re-export it.

import { z } from "zod";
import { formatJsonPointer } from "../json/index.ts";
import type { FluxNodeIssue, FluxNodeParseResult, FluxNodeRawIssue } from "./issue.ts";

/** Runs `schema` over an untrusted value without throwing, answering with FluxNode issues. */
export function parseWithZod<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): FluxNodeParseResult<T> {
  let parsed: z.SafeParseReturnType<unknown, T>;
  try {
    parsed = schema.safeParse(value);
  } catch {
    return { ok: false, issues: [{ path: "", code: "invalid", message: "The value could not be read." }] };
  }
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: issuesFromZod(parsed.error) };
}

/** Converts zod's issues, keeping a custom issue's own `params.code`, each listed once. */
export function issuesFromZod(error: z.ZodError): FluxNodeIssue[] {
  const seen = new Set<string>();
  const issues: FluxNodeIssue[] = [];
  for (const issue of error.issues) {
    const params = issue.code === z.ZodIssueCode.custom ? issue.params : undefined;
    const code = typeof params?.["code"] === "string" ? params["code"] : issue.code;
    const converted: FluxNodeIssue = { path: formatJsonPointer(issue.path), code, message: issue.message };
    const key = `${converted.path}\u0000${converted.code}\u0000${converted.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(converted);
  }
  return issues;
}

/**
 * Wraps a parser that collects raw issues as a zod schema: zod prefixes each issue's
 * steps with where the value sat, so the whole document's pointers come out right.
 */
export function zodFromParser<T>(read: (value: unknown, issues: FluxNodeRawIssue[]) => T | null): z.ZodType<T, z.ZodTypeDef, unknown> {
  return z.unknown().transform((value, context): T => {
    const issues: FluxNodeRawIssue[] = [];
    let result: T | null;
    try {
      result = read(value, issues);
    } catch {
      issues.push({ path: [], code: "invalid", message: "The value could not be read." });
      result = null;
    }
    for (const issue of issues) context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message, params: { code: issue.code } });
    if (issues.length > 0 || result === null) {
      if (issues.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "The value could not be read.", params: { code: "invalid" } });
      return z.NEVER;
    }
    return result;
  });
}

/** Answers a raw-issue parser's outcome as a FluxNode parse result. */
export function finishRawParse<T>(result: T | null, issues: FluxNodeRawIssue[]): FluxNodeParseResult<T> {
  if (issues.length === 0 && result !== null) return { ok: true, value: result };
  const seen = new Set<string>();
  const converted: FluxNodeIssue[] = [];
  for (const issue of issues.length > 0 ? issues : [{ path: [], code: "invalid", message: "The value could not be read." }]) {
    const pointer = formatJsonPointer(issue.path);
    const key = `${pointer}\u0000${issue.code}\u0000${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    converted.push({ path: pointer, code: issue.code, message: issue.message });
  }
  return { ok: false, issues: converted };
}
