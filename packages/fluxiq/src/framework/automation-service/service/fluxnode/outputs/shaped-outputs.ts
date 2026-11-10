// A FluxNode run's outputs, made from what Core holds and never from a model's words (fluxnode-plan
// N3): rows real reads stored, lasting acts from the act record, and the run's own inputs. Each value
// carries its lineage: the read that stored its row, or the input it is.
//
// **With a declared type** the outputs take its shape, deterministically:
//   an array                    every row, each cut to the item's declared properties
//   an object                   each property: an array property is the rows as above; a property
//                               named for an input is that input; else the one row's field of that
//                               name (by column id, then by its label), when exactly one row was read
//   a scalar                    the one value of the one row with one column
// A row field is found by its column id or label; text that reads cleanly as the number or boolean a
// property declares is taken as that value, which changes its type and never its content. Whatever
// cannot be filled is left out, and the type check (`validateJsonValue`) then says what is missing,
// as a "no" the attempt reads (`../events/check-bridge.ts`).
//
// **With none,** what the task produced: `records` (the rows) and `acts` (the acts that landed, in
// Core's words), each only when there is some. Nothing at all is no outputs.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { DataLineage, JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** What outputs may be made from: the rows as stored (keyed by column id), the acts and the inputs. */
export type FluxNodeOutputSources = {
  runId: string;
  flowId: string;
  rows?: { datasetId: string; columns: readonly { id: string; label: string }[]; rows: readonly JsonObject[] } | undefined;
  acts: readonly AutomationStudioAttemptAct[];
  inputs: JsonObject;
};

export type FluxNodeShapedOutputs = { outputs?: JsonValue; lineage: DataLineage[] };

/** At most this many lineage entries go with a result (`fluxNodeRunResultSchema`). */
const MOST_LINEAGE = 1000;
const ID_UNSAFE = /[^A-Za-z0-9._:-]/gu;

export function fluxNodeShapedOutputs(type: JsonTypeSchema | undefined, sources: FluxNodeOutputSources): FluxNodeShapedOutputs {
  const lineage: DataLineage[] = [];
  const shaper = new Shaper(sources, lineage);
  const outputs = type === undefined || isAny(type) ? shaper.undeclared() : shaper.shape(type, "");
  return { ...(outputs === undefined ? {} : { outputs }), lineage: lineage.length > MOST_LINEAGE ? coarse(lineage) : lineage };
}

class Shaper {
  private readonly rows: readonly JsonObject[];

  constructor(private readonly sources: FluxNodeOutputSources, private readonly lineage: DataLineage[]) {
    this.rows = sources.rows?.rows ?? [];
  }

  undeclared(): JsonValue | undefined {
    const outputs: JsonObject = {};
    if (this.sources.rows && this.rows.length) outputs.records = this.records(undefined, "/records");
    const landed = this.sources.acts.filter((act) => act.state === "landed");
    if (landed.length) outputs.acts = landed.map((act, index) => this.act(act, `/acts/${index}`));
    return Object.keys(outputs).length ? outputs : undefined;
  }

  shape(type: JsonTypeSchema, pointer: string): JsonValue | undefined {
    const kinds = kindsOf(type);
    if (kinds.has("array")) return this.records(type.items, pointer);
    if (kinds.has("object")) return this.object(type, pointer);
    return this.scalar(type, pointer);
  }

  private object(type: JsonTypeSchema, pointer: string): JsonValue | undefined {
    const value: JsonObject = {};
    for (const [name, property] of Object.entries(type.properties ?? {})) {
      const at = `${pointer}/${escapePointer(name)}`;
      const filled = kindsOf(property).has("array") ? this.records(property.items, at) : this.named(name, property, at);
      if (filled !== undefined) value[name] = filled;
    }
    return value;
  }

  private named(name: string, type: JsonTypeSchema, pointer: string): JsonValue | undefined {
    if (Object.hasOwn(this.sources.inputs, name)) {
      this.lineage.push({ pointer, runId: this.sources.runId, source: { kind: "input", pointer: `/${escapePointer(name)}` } });
      return structuredClone(this.sources.inputs[name] as JsonValue);
    }
    if (this.rows.length !== 1) return undefined;
    const field = this.fieldOf(name);
    if (field === undefined || !Object.hasOwn(this.rows[0]!, field)) return undefined;
    this.traceRow(pointer, 0);
    return taken(this.rows[0]![field] as JsonValue, type);
  }

  private scalar(type: JsonTypeSchema, pointer: string): JsonValue | undefined {
    const columns = this.sources.rows?.columns ?? [];
    if (this.rows.length !== 1 || columns.length !== 1 || !Object.hasOwn(this.rows[0]!, columns[0]!.id)) return undefined;
    this.traceRow(pointer, 0);
    return taken(this.rows[0]![columns[0]!.id] as JsonValue, type);
  }

  /** Every row, cut to the item's properties when it declares some, else to the stored columns. */
  private records(item: JsonTypeSchema | undefined, pointer: string): JsonValue[] {
    const properties = item?.properties;
    return this.rows.map((row, index) => {
      this.traceRow(`${pointer}/${index}`, index);
      if (properties === undefined) return this.stored(row);
      const cut: JsonObject = {};
      for (const [name, property] of Object.entries(properties)) {
        const field = this.fieldOf(name);
        if (field !== undefined && Object.hasOwn(row, field)) cut[name] = taken(row[field] as JsonValue, property);
      }
      return cut;
    });
  }

  /** A row as stored: its columns only, so nothing the read kept for itself goes out. */
  private stored(row: JsonObject): JsonObject {
    const columns = this.sources.rows?.columns ?? [];
    const kept: JsonObject = {};
    for (const column of columns) if (Object.hasOwn(row, column.id)) kept[column.id] = structuredClone(row[column.id] as JsonValue);
    return kept;
  }

  private act(act: AutomationStudioAttemptAct, pointer: string): JsonObject {
    this.lineage.push({ pointer, runId: this.sources.runId, flowId: this.sources.flowId, stepId: safeId(`act.${act.id}`), source: { kind: "read", readId: safeId(`act.${act.id}`) } });
    return { what: act.what, where: act.where, classes: [...act.classes], state: act.state };
  }

  /** The stored column a declared name means: its id, else its label, without regard to case. */
  private fieldOf(name: string): string | undefined {
    const columns = this.sources.rows?.columns ?? [];
    const lower = name.toLowerCase();
    return columns.find((column) => column.id === name)?.id ?? columns.find((column) => column.id.toLowerCase() === lower || column.label.toLowerCase() === lower)?.id;
  }

  private traceRow(pointer: string, index: number): void {
    const datasetId = this.sources.rows?.datasetId ?? "rows";
    this.lineage.push({ pointer, runId: this.sources.runId, flowId: this.sources.flowId, stepId: safeId(`read.${datasetId}`), source: { kind: "read", readId: safeId(`${datasetId}.${index}`) } });
  }
}

function kindsOf(type: JsonTypeSchema): Set<string> {
  if (type.type === undefined) return new Set();
  return new Set(Array.isArray(type.type) ? type.type : [type.type]);
}

function isAny(type: JsonTypeSchema): boolean {
  return type.type === undefined && type.anyOf === undefined && type.oneOf === undefined && type.enum === undefined && type.const === undefined;
}

/** A stored value as the declared kind wants it, where its text says that value exactly; otherwise as stored. */
function taken(value: JsonValue, type: JsonTypeSchema): JsonValue {
  if (typeof value !== "string") return structuredClone(value);
  const kinds = kindsOf(type);
  if (kinds.has("string") || kinds.size === 0) return value;
  const text = value.trim();
  if ((kinds.has("number") || kinds.has("integer")) && /^-?\d+(?:\.\d+)?$/u.test(text)) {
    const number = Number(text);
    if (kinds.has("number") || Number.isInteger(number)) return number;
  }
  if (kinds.has("boolean") && (text === "true" || text === "false")) return text === "true";
  return value;
}

function escapePointer(name: string): string {
  return name.replaceAll("~", "~0").replaceAll("/", "~1");
}

function safeId(text: string): string {
  return text.replace(ID_UNSAFE, "_").slice(0, 128) || "_";
}

/** Too many entries: one per output array or value at the top, which still names every source. */
function coarse(lineage: readonly DataLineage[]): DataLineage[] {
  const kept = new Map<string, DataLineage>();
  for (const entry of lineage) {
    const top = entry.pointer.split("/").slice(0, 2).join("/");
    const key = `${top} ${entry.source.kind === "input" ? entry.source.pointer : entry.stepId ?? ""}`;
    if (!kept.has(key)) kept.set(key, { ...entry, pointer: top, ...(entry.source.kind === "read" ? { source: { kind: "read" as const, readId: entry.stepId ?? entry.source.readId } } : {}) });
  }
  return [...kept.values()].slice(0, MOST_LINEAGE);
}
