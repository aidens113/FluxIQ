import { parseAutomationStudioObjectContentRef } from "../../../storage/index.ts";

// Every content-addressed object id reachable from a document, and the set of
// them a project still needs. Kept beside the deletion pass that consumes it.

export function addAutomationStudioObjectSha256s(refs: Set<string>, value: unknown, projectId: string, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(parsed.sha256);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addAutomationStudioObjectSha256s(refs, item, projectId, seen);
    return;
  }
  const record = value as Record<string, unknown>;
  const reference = record.$fluxiqObject;
  if (reference && typeof reference === "object" && !Array.isArray(reference)) {
    const sha256 = (reference as Record<string, unknown>).sha256;
    if (typeof sha256 === "string" && /^[a-f0-9]{64}$/i.test(sha256)) refs.add(sha256.toLowerCase());
  }
  for (const item of Object.values(record)) addAutomationStudioObjectSha256s(refs, item, projectId, seen);
}

export function collectAutomationStudioObjectSha256s(value: unknown, projectId: string): Set<string> {
  const refs = new Set<string>();
  addAutomationStudioObjectSha256s(refs, value, projectId);
  return refs;
}
