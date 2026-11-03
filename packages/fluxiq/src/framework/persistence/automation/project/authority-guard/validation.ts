import { createHash } from "node:crypto";
import type { AuthorityGuardCaptureIdentity, AuthorityGuardCaptureRequest, AuthorityGuardLegacyRequest } from "./contracts.ts";

function canonical(value: unknown, depth = 0, budget = { nodes: 0 }): string {
  if (++budget.nodes > 1024 || typeof value === "string" && value.length > 8192) throw new Error("authority_guard.size");
  if (depth > 12) throw new Error("authority_guard.depth");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object" || value === null) throw new Error("authority_guard.non_json");
  if (Object.getOwnPropertySymbols(value).length) throw new Error("authority_guard.symbol");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(item => !("value" in item))) throw new Error("authority_guard.accessor");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 1024 || Object.keys(descriptors).some(key => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)) || Object.keys(descriptors).length !== value.length + 1) throw new Error("authority_guard.array");
    return `[${value.map(item => canonical(item, depth + 1, budget)).join(",")}]`;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("authority_guard.non_plain");
  if (Object.values(descriptors).some(item => !item.enumerable)) throw new Error("authority_guard.non_enumerable");
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(descriptors[key]!.value, depth + 1, budget)}`).join(",")}}`;
}
function digest(value: unknown): string { const json = canonical(value); if (Buffer.byteLength(json, "utf8") > 8192) throw new Error("authority_guard.size"); return `sha256:${createHash("sha256").update(json).digest("hex")}`; }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function clone<T>(value: T): T { digest(value); return freeze(structuredClone(value)); }
function closed(value: unknown, keys: string[]): asserts value is Record<string, unknown> { digest(value); if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) throw new Error("authority_guard.envelope"); }
function id(value: unknown): asserts value is string { if (typeof value !== "string" || value.length < 1 || value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new Error("authority_guard.id"); }
function hash(value: unknown): asserts value is string { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error("authority_guard.digest"); }
function integer(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("authority_guard.integer"); }
const ownerKeys = ["protocolVersion", "projectId", "ownerKind", "ownerId", "requestDigest", "expectedRevision"];
function owner(input: Record<string, unknown>, projectId: string) { for (const key of ["projectId", "ownerKind", "ownerId"]) id(input[key]); hash(input.requestDigest); integer(input.expectedRevision); if (input.protocolVersion !== 1 || input.projectId !== projectId) throw new Error("authority_guard.owner"); }
function legacy(input: AuthorityGuardLegacyRequest, projectId: string): AuthorityGuardLegacyRequest { closed(input, [...ownerKeys, "operationKey", "operationKind"]); owner(input, projectId); id(input.operationKind); id(input.operationKey); if (input.operationKey.length > 160) throw new Error("authority_guard.key"); return clone(input); }
function capture(input: AuthorityGuardCaptureRequest, projectId: string): AuthorityGuardCaptureRequest { closed(input, [...ownerKeys, "captureKey"]); owner(input, projectId); id(input.captureKey); if (input.captureKey.length > 160) throw new Error("authority_guard.key"); return clone(input); }
function identity(input: AuthorityGuardCaptureIdentity): AuthorityGuardCaptureIdentity { closed(input, ["captureKey", "ownerKind", "ownerId", "requestDigest", "captureDigest"]); id(input.captureKey); id(input.ownerKind); id(input.ownerId); hash(input.requestDigest); hash(input.captureDigest); return clone(input); }
function decode<T>(value: string): T { if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 8192) throw new Error("authority_guard.record_size"); const result = JSON.parse(value) as T; digest(result); return result; }
function unknown(reason: unknown): void { if (!["effect_uncertain", "completion_uncertain", "owner_interrupted"].includes(reason as string)) throw new Error("authority_guard.unknown_reason"); }

export const AutomationStudioAuthorityGuardValidation: { digest: typeof digest; clone: typeof clone; closed: typeof closed; id: typeof id; hash: typeof hash; integer: typeof integer; legacy: typeof legacy; capture: typeof capture; identity: typeof identity; decode: typeof decode; unknown: typeof unknown } = { digest, clone, closed, id, hash, integer, legacy, capture, identity, decode, unknown };
