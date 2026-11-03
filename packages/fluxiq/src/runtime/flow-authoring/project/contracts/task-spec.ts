import type { AutomationStudioProjectDroppedIssue, AutomationStudioProjectParse, AutomationStudioProjectTaskAnswer, AutomationStudioProjectTaskAnswerRows, AutomationStudioProjectTaskEffect, AutomationStudioProjectTaskPart, AutomationStudioProjectTaskSpec } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import type { InstructionSource as AutomationStudioProjectInstructionSource } from "../../../../flows/authoring/instruction/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

const VERSION = "project.task_spec.v1";
const LIMITS = { parts: 50, quote: 4000, facts: 50, fact: 500, notAsked: 50, columns: 50, column: 200, effectText: 200, unchanged: 20 } as const;
const EFFECT_COUNT_MAX = 1000;
const ANSWER_KINDS = ["records"] as const;
/** The most rows an answer may declare (header, K2). */
const ROWS_MAX = 10_000;
const ROWS_INVALID = "project.answer_rows_invalid";

export const automationStudioProjectTaskSpec = Object.freeze({
  /** The digest of a spec's content; the `digest` field is excluded. */
  digest(spec: Omit<AutomationStudioProjectTaskSpec, "digest">): string {
    return automationStudioProjectDigest(VERSION, { parts: spec.parts, notAsked: spec.notAsked, unchanged: spec.unchanged });
  },

  /** Reads a spec and refuses one whose digest is not the digest of what it says. */
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectTaskSpec> {
    return shape.parse(() => read(value));
  },

  /** Every quote is a verbatim span of an active source it names, and no two parts of one source share a character of it (header). */
  quoteIssues(spec: AutomationStudioProjectTaskSpec, sources: readonly AutomationStudioProjectInstructionSource[]): Array<{ code: string; path: string }> {
    const issues: Array<{ code: string; path: string }> = [];
    /** The spans the earlier parts hold, by source id. */
    const placed = new Map<string, Array<[number, number]>>();
    for (const [index, part] of spec.parts.entries()) {
      const source = sources.find((candidate) => candidate.sourceId === part.quote.sourceId);
      if (!source) issues.push({ code: "project.quote_source_unknown", path: `taskSpec.parts.${index}.quote.sourceId` });
      else if (!source.text.includes(part.quote.text)) issues.push({ code: "project.quote_not_verbatim", path: `taskSpec.parts.${index}.quote.text` });
      else {
        const held = placed.get(source.sourceId) ?? [];
        const span = freeSpan(source.text, part.quote.text, held);
        if (!span) issues.push({ code: "project.quote_overlaps", path: `taskSpec.parts.${index}.quote.text` });
        else placed.set(source.sourceId, [...held, span]);
      }
    }
    return issues;
  },

  /**
   * What an amendment, `next`, drops of the person's words the plan in force, `current`, quotes (header, t645): each
   * stretch of more than `EDGE_WORDS` words, or the whole of a part's words, no part of `next` quotes; and each
   * `notAsked` item `next` adds that holds a part of `current`'s words or is held in them. A part whose instruction is
   * no longer active is not measured.
   */
  droppedIssues(current: AutomationStudioProjectTaskSpec, next: AutomationStudioProjectTaskSpec, sources: readonly AutomationStudioProjectInstructionSource[]): AutomationStudioProjectDroppedIssue[] {
    const issues: AutomationStudioProjectDroppedIssue[] = [];
    const before = placedParts(current, sources);
    const after = placedParts(next, sources);
    for (const { part, source, span } of before) {
      const covered = after.filter((placed) => placed.source === source).map((placed) => placed.span);
      for (const dropped of droppedStretches(source.text, span, covered)) issues.push({ code: DROPPED, path: "taskSpec.parts", part: part.id, dropped });
    }
    const kept = new Set(current.notAsked);
    for (const [index, item] of next.notAsked.entries()) {
      if (kept.has(item)) continue;
      const said = ` ${wordsOf(item).join(" ")} `;
      const held = current.parts.find((part) => {
        const quoted = ` ${wordsOf(part.quote.text).join(" ")} `;
        return said.trim() !== "" && quoted.trim() !== "" && (said.includes(quoted) || quoted.includes(said));
      });
      if (held) issues.push({ code: DROPPED, path: `taskSpec.notAsked.${index}`, part: held.id, dropped: held.quote.text });
    }
    return issues;
  }
});

const DROPPED = "project.plan_part_dropped";
/** The most words a stretch may lose where parts are reworded or re-split, as `../supervisor/state.ts` keeps a reworded part (header). */
const EDGE_WORDS = 2;

/** Each part of `spec` whose words stand in an active source, at the place `quoteIssues` gives it. */
function placedParts(spec: AutomationStudioProjectTaskSpec, sources: readonly AutomationStudioProjectInstructionSource[]): Array<{ part: AutomationStudioProjectTaskPart; source: AutomationStudioProjectInstructionSource; span: [number, number] }> {
  const placed = new Map<string, Array<[number, number]>>();
  return spec.parts.flatMap((part) => {
    const source = sources.find((candidate) => candidate.sourceId === part.quote.sourceId);
    if (!source || !source.text.includes(part.quote.text)) return [];
    const held = placed.get(source.sourceId) ?? [];
    const span = freeSpan(source.text, part.quote.text, held) ?? firstSpan(source.text, part.quote.text);
    placed.set(source.sourceId, [...held, span]);
    return [{ part, source, span }];
  });
}

/** The words of `span` in `text` that no span of `covered` holds, as said: every stretch longer than `EDGE_WORDS` words, or the whole span when none of its words is held (header). */
function droppedStretches(text: string, span: readonly [number, number], covered: ReadonlyArray<readonly [number, number]>): string[] {
  const held = (at: number) => covered.some(([start, stop]) => at >= start && at < stop);
  const lost: string[] = [];
  let kept = "";
  let run = "";
  for (let at = span[0]; at <= span[1]; at += 1) {
    if (at < span[1] && !held(at)) {
      run += text[at];
      continue;
    }
    if (at < span[1]) kept += text[at];
    if (run) lost.push(run);
    run = "";
  }
  if (!wordsOf(kept).length) return wordsOf(text.slice(span[0], span[1])).length ? [text.slice(span[0], span[1]).trim()] : [];
  return lost.filter((stretch) => wordsOf(stretch).length > EDGE_WORDS).map((stretch) => stretch.trim());
}

function firstSpan(text: string, quote: string): [number, number] {
  const at = text.indexOf(quote);
  return [at, at + quote.length];
}

/** A text's words, lower case, with no punctuation, as `../supervisor/state.ts` compares a part's words. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The first place `quote` stands in `text` that shares no character with a span `held`; undefined when every place does (header). */
function freeSpan(text: string, quote: string, held: ReadonlyArray<readonly [number, number]>): [number, number] | undefined {
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const end = at + quote.length;
    if (held.every(([start, stop]) => end <= start || at >= stop)) return [at, end];
  }
  return undefined;
}

function read(value: unknown): AutomationStudioProjectTaskSpec {
  const fields = shape.object(value, "taskSpec", ["parts", "notAsked", "digest"], ["unchanged"]);
  const rawParts = shape.array(fields.parts, "taskSpec.parts", LIMITS.parts);
  if (!rawParts.length) return shape.refuse("project.task_spec_empty", "taskSpec.parts");
  const parts = rawParts.map((part, index) => readPart(part, `taskSpec.parts.${index}`));
  if (new Set(parts.map((part) => part.id)).size !== parts.length) return shape.refuse("project.duplicate_part", "taskSpec.parts");
  const notAsked = shape.array(fields.notAsked, "taskSpec.notAsked", LIMITS.notAsked).map((item, index) => shape.text(item, `taskSpec.notAsked.${index}`, LIMITS.fact));
  const unchanged = fields.unchanged === undefined ? undefined : readUnchanged(fields.unchanged);
  const digest = shape.digest(fields.digest, "taskSpec.digest");
  if (digest !== automationStudioProjectTaskSpec.digest({ parts, notAsked, ...(unchanged ? { unchanged } : {}) })) return shape.refuse("project.task_spec_digest_mismatch", "taskSpec.digest");
  return { parts, notAsked, ...(unchanged ? { unchanged } : {}), digest };
}

function readPart(value: unknown, path: string): AutomationStudioProjectTaskPart {
  const fields = shape.object(value, path, ["id", "quote", "goalFacts", "lastingActs"], ["answer", "effect"]);
  const quote = shape.object(fields.quote, `${path}.quote`, ["sourceId", "text"]);
  const lastingActs = shape.array(fields.lastingActs, `${path}.lastingActs`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length)
    .map((act, index) => shape.oneOf(act, `${path}.lastingActs.${index}`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES));
  if (new Set(lastingActs).size !== lastingActs.length) return shape.refuse("project.duplicate", `${path}.lastingActs`);
  return {
    id: shape.id(fields.id, `${path}.id`),
    quote: { sourceId: shape.id(quote.sourceId, `${path}.quote.sourceId`), text: shape.text(quote.text, `${path}.quote.text`, LIMITS.quote) },
    goalFacts: shape.array(fields.goalFacts, `${path}.goalFacts`, LIMITS.facts).map((fact, index) => shape.text(fact, `${path}.goalFacts.${index}`, LIMITS.fact)),
    lastingActs,
    ...(fields.answer !== undefined ? { answer: readAnswer(fields.answer, `${path}.answer`) } : {}),
    ...(fields.effect !== undefined ? { effect: readEffect(fields.effect, `${path}.effect`, lastingActs) } : {})
  };
}

/** A part's declared answer (header, t757): a known kind and distinct column names. */
function readAnswer(value: unknown, path: string): AutomationStudioProjectTaskAnswer {
  const fields = shape.object(value, path, ["kind", "columns"], ["rows"]);
  const kind = shape.oneOf(fields.kind, `${path}.kind`, ANSWER_KINDS);
  const columns = shape.array(fields.columns, `${path}.columns`, LIMITS.columns).map((column, index) => shape.text(column, `${path}.columns.${index}`, LIMITS.column));
  if (new Set(columns).size !== columns.length) return shape.refuse("project.duplicate", `${path}.columns`);
  return { kind, columns, ...(fields.rows !== undefined ? { rows: readRows(fields.rows, `${path}.rows`) } : {}) };
}

/** An answer's declared rows (header, K2): exactly a count, or a range, of whole numbers from 1 to `ROWS_MAX`, as written. */
function readRows(value: unknown, path: string): AutomationStudioProjectTaskAnswerRows {
  const fields = shape.object(value, path, [], ["count", "atLeast", "atMost"]);
  const read = (key: "count" | "atLeast" | "atMost"): number | undefined => {
    const field = fields[key];
    if (field === undefined) return undefined;
    if (typeof field !== "number" || !Number.isSafeInteger(field) || field < 1 || field > ROWS_MAX) return shape.refuse(ROWS_INVALID, `${path}.${key}`);
    return field;
  };
  const count = read("count");
  const atLeast = read("atLeast");
  const atMost = read("atMost");
  if (count === undefined && atLeast === undefined && atMost === undefined) return shape.refuse(ROWS_INVALID, path);
  if (count !== undefined && (atLeast !== undefined || atMost !== undefined)) return shape.refuse(ROWS_INVALID, path);
  if (atLeast !== undefined && atMost !== undefined && atLeast > atMost) return shape.refuse(ROWS_INVALID, path);
  return { ...(count !== undefined ? { count } : {}), ...(atLeast !== undefined ? { atLeast } : {}), ...(atMost !== undefined ? { atMost } : {}) };
}

const EFFECT_INVALID = "project.plan_effect_invalid";

/** What `unchanged` lists (header, t775): distinct, non-empty things, at most `LIMITS.unchanged`. */
function readUnchanged(value: unknown): string[] {
  const items = shape.array(value, "taskSpec.unchanged", LIMITS.unchanged).map((item, index) => shape.text(item, `taskSpec.unchanged.${index}`, LIMITS.effectText));
  if (new Set(items).size !== items.length) return shape.refuse("project.duplicate", "taskSpec.unchanged");
  return items;
}

/** A part's declared effect (header, t775): a known shape that fits the part's lasting acts. */
function readEffect(value: unknown, path: string, acts: readonly AutomationStudioActionConsequence[]): AutomationStudioProjectTaskEffect {
  const raw = shape.object(value, path, ["kind"], ["direction", "count", "what", "state"]);
  const kind = shape.oneOf(raw.kind, `${path}.kind`, ["change", "end_state"] as const);
  const allow = (...needed: AutomationStudioActionConsequence[]) => needed.some((act) => acts.includes(act));
  const text = (field: unknown, at: string): string => {
    if (typeof field !== "string" || !field.trim() || field.trim().length > LIMITS.effectText) return shape.refuse(EFFECT_INVALID, at);
    return field.trim();
  };
  if (kind === "end_state") {
    for (const key of ["direction", "count", "what"]) if (raw[key] !== undefined) return shape.refuse("project.unknown_field", `${path}.${key}`);
    const state = text(raw.state, `${path}.state`);
    if (!allow("modify_existing")) return shape.refuse(EFFECT_INVALID, path);
    return { kind, state };
  }
  if (raw.state !== undefined) return shape.refuse("project.unknown_field", `${path}.state`);
  const direction = shape.oneOf(raw.direction, `${path}.direction`, ["adds", "removes"] as const);
  const count = raw.count;
  if (count !== "each_match" && !(typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= EFFECT_COUNT_MAX)) return shape.refuse(EFFECT_INVALID, `${path}.count`);
  const what = text(raw.what, `${path}.what`);
  if (!(direction === "adds" ? allow("create_new", "modify_existing") : allow("delete", "modify_existing"))) return shape.refuse(EFFECT_INVALID, path);
  return { kind, direction, count, what };
}
