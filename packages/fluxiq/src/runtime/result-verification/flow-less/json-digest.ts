// A digest of any JSON value, the same whatever order its keys were written in: the one way a
// check's evidence is compared (`./summary-digest.ts`, and the completion check's deciding
// digest, `SVC/answer-first/completion/deciding-digest.ts`).

import { createHash } from "node:crypto";

/** Same value, same digest, whatever order any object's keys were written in; a member that is `undefined` is no member. */
export function automationStudioFlowLessJsonDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

/** Copied from `../../llm/repeat-policy.ts`, whose own is private. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const members = Object.entries(value).filter(([, member]) => member !== undefined).sort(([one], [two]) => (one < two ? -1 : one > two ? 1 : 0));
    return `{${members.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
