import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS as LIMITS } from "./limits.ts";
import { AutomationStudioDomainBuildStateRefusal as Refusal } from "./refusal.ts";

// One domain's values for one Flow, as they are stored: the Flow's own scope
// and one scope per build, each stamped with when it was last written so the
// build written longest ago is the one let go when there are too many.
//
// Values are kept as the JSON they were put as. Core never reads into them;
// it counts their bytes and nothing else.

/** The stored shape (schema version 1). */
type StoredScope = { values: Record<string, JsonValue>; written: number };
type Stored = { schemaVersion: 1; domainId: string; sequence: number; flow?: StoredScope; builds: Record<string, StoredScope> };

/** How deep a value may nest: far past anything a domain's memory needs, and short of a stack a hostile value could exhaust. */
const MAX_DEPTH = 32;

export class AutomationStudioDomainBuildStateDocument {
  private constructor(private readonly stored: Stored) {}

  /** A document with nothing in it yet. */
  static empty(domainId: string): AutomationStudioDomainBuildStateDocument {
    return new AutomationStudioDomainBuildStateDocument({ schemaVersion: 1, domainId, sequence: 0, builds: {} });
  }

  /**
   * The document stored for `domainId`, or an empty one when nothing was ever
   * stored. A document of another shape, or another domain's under the same
   * file name, is refused rather than read as empty: an empty answer would let
   * the next write erase what is there.
   */
  static parse(data: JsonObject, domainId: string): AutomationStudioDomainBuildStateDocument {
    if (!Object.keys(data).length) return AutomationStudioDomainBuildStateDocument.empty(domainId);
    if (data.schemaVersion !== 1 || !isCount(data.sequence) || !isRecord(data.builds)) throw new Refusal("domain_build_state.document_invalid", "document");
    if (data.domainId !== domainId) throw new Refusal("domain_build_state.domain_mismatch", "document.domainId");
    const builds: Record<string, StoredScope> = {};
    for (const [buildId, scope] of Object.entries(data.builds)) builds[buildId] = storedScope(scope, `document.builds.${buildId}`);
    const stored: Stored = { schemaVersion: 1, domainId, sequence: data.sequence, builds };
    if (data.flow !== undefined) stored.flow = storedScope(data.flow, "document.flow");
    return new AutomationStudioDomainBuildStateDocument(stored);
  }

  /** The value under `key` in the scope of `buildId` (the Flow's own when absent), as a copy. */
  get(buildId: string | undefined, key: string): JsonValue | undefined {
    const value = this.scope(buildId)?.values[key];
    return value === undefined ? undefined : structuredClone(value);
  }

  /** Stores `value` under `key`, refusing what would pass a bound, and lets the oldest build go past the count of builds. */
  put(buildId: string | undefined, key: string, value: JsonValue): void {
    if (!isJsonValue(value, new Set(), 0)) throw new Refusal("domain_build_state.value_invalid", "value");
    const bytes = byteLength(value);
    if (bytes > LIMITS.maxValueBytes) throw new Refusal("domain_build_state.value_too_large", "value");
    const scope = this.scope(buildId) ?? { values: {}, written: 0 };
    const others = Object.entries(scope.values).filter(([name]) => name !== key);
    if (others.length >= LIMITS.maxKeysPerScope) throw new Refusal("domain_build_state.scope_full", "key");
    if (others.reduce((sum, [, held]) => sum + byteLength(held), bytes) > LIMITS.maxScopeBytes) throw new Refusal("domain_build_state.scope_full", "value");
    scope.values[key] = structuredClone(value);
    this.stored.sequence += 1;
    scope.written = this.stored.sequence;
    if (buildId === undefined) {
      this.stored.flow = scope;
      return;
    }
    this.stored.builds[buildId] = scope;
    const builds = Object.entries(this.stored.builds).sort(([, a], [, b]) => a.written - b.written);
    for (const [oldest] of builds.slice(0, Math.max(0, builds.length - LIMITS.maxBuildsPerFlow))) delete this.stored.builds[oldest];
  }

  /** Removes the value under `key`, and its scope with it once the scope holds nothing; whether there was one. */
  drop(buildId: string | undefined, key: string): boolean {
    const scope = this.scope(buildId);
    if (!scope || !Object.prototype.hasOwnProperty.call(scope.values, key)) return false;
    delete scope.values[key];
    if (Object.keys(scope.values).length) return true;
    if (buildId === undefined) delete this.stored.flow;
    else delete this.stored.builds[buildId];
    return true;
  }

  /** What is written back. */
  toJson(): JsonObject {
    const json: JsonObject = { schemaVersion: 1, domainId: this.stored.domainId, sequence: this.stored.sequence, builds: structuredClone(this.stored.builds) };
    if (this.stored.flow) json.flow = structuredClone(this.stored.flow);
    return json;
  }

  private scope(buildId: string | undefined): StoredScope | undefined {
    if (buildId === undefined) return this.stored.flow;
    return Object.prototype.hasOwnProperty.call(this.stored.builds, buildId) ? this.stored.builds[buildId] : undefined;
  }
}

function storedScope(value: JsonValue | undefined, part: string): StoredScope {
  if (!isRecord(value) || !isRecord(value.values) || !isCount(value.written)) throw new Refusal("domain_build_state.document_invalid", part);
  return { values: { ...value.values }, written: value.written };
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function byteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Plain JSON only: what is stored is exactly what is read back. */
function isJsonValue(value: unknown, ancestors: Set<object>, depth: number): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > MAX_DEPTH || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  // `Array.from` reads a hole as undefined, which is refused rather than written back as null.
  const items: unknown[] = Array.isArray(value) ? Array.from(value) : Object.values(value as Record<string, unknown>);
  const valid = items.every((item) => isJsonValue(item, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}
