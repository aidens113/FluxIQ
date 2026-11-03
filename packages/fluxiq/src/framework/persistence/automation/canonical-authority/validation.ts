import { createHash } from "node:crypto";
import path from "node:path";
import type { CanonicalAuthorityKind, CanonicalAuthorityOptions, CanonicalAuthorityDomainConstraint } from "./contracts.ts";

function canonical(value: unknown, depth = 0, budget = { nodes: 0 }): string {
  if (++budget.nodes > 100_000 || depth > 40) throw new Error("canonical_authority.document_size");
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== "object" || Object.getOwnPropertySymbols(value).length) throw new Error("canonical_authority.json");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.values(fields).some(field => !("value" in field))) throw new Error("canonical_authority.accessor");
  if (Array.isArray(value)) {
    if (Object.keys(fields).length !== value.length + 1 || value.some((_, i) => !fields[i])) throw new Error("canonical_authority.array");
    return `[${Array.from({ length: value.length }, (_, i) => canonical(fields[i]!.value, depth + 1, budget)).join(",")}]`;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.values(fields).some(field => !field.enumerable)) throw new Error("canonical_authority.object");
  return `{${Object.keys(fields).sort().map(key => `${JSON.stringify(key)}:${canonical(fields[key]!.value, depth + 1, budget)}`).join(",")}}`;
}
function digest(value: unknown): string { const bytes = canonical(value); if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw new Error("canonical_authority.document_size"); return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function clone<T>(value: T): T { digest(value); return freeze(structuredClone(value)); }
function closed(value: unknown, keys: string[]): asserts value is Record<string, unknown> { digest(value); if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) throw new Error("canonical_authority.envelope"); }
function id(value: unknown): asserts value is string { if (typeof value !== "string" || value.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/.test(value)) throw new Error("canonical_authority.id"); }
function integer(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("canonical_authority.integer"); }
function hash(value: unknown): asserts value is string { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error("canonical_authority.hash"); }
function kind(value: unknown): asserts value is CanonicalAuthorityKind { if (value !== "automation.flows" && value !== "automation.flow_publications") throw new Error("canonical_authority.kind"); }
function constraint(value: CanonicalAuthorityDomainConstraint): CanonicalAuthorityDomainConstraint {
  value = clone(value);
  if (value?.kind === "any") closed(value, ["kind"]);
  else { closed(value, ["kind", "domainId"]); if (value.kind !== "exact") throw new Error("canonical_authority.domain_constraint"); if (value.domainId !== null) id(value.domainId); }
  return clone(value);
}
function options(input: CanonicalAuthorityOptions): CanonicalAuthorityOptions {
  closed(input, ["projectRootDir", "projectDatabaseRootDir"]);
  for (const value of Object.values(input)) if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0") || value.length > 4096) throw new Error("canonical_authority.root");
  const result = { projectRootDir: path.resolve(input.projectRootDir), projectDatabaseRootDir: path.resolve(input.projectDatabaseRootDir) };
  if (result.projectRootDir !== path.join(result.projectDatabaseRootDir, "projects")) throw new Error("canonical_authority.project_layout");
  return Object.freeze(result);
}

export const CanonicalAuthorityValidation: { digest: typeof digest; clone: typeof clone; closed: typeof closed; id: typeof id; integer: typeof integer; hash: typeof hash; kind: typeof kind; options: typeof options; constraint: typeof constraint } = { digest, clone, closed, id, integer, hash, kind, options, constraint };
