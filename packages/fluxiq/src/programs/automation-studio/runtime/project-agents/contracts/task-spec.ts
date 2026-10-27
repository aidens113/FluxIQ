import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import type { AutomationStudioProjectInstructionSource } from "./instruction-source.ts";
import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";

// The task spec: what the person asked for, split into parts, each grounded in
// the person's own words. The judge still receives the original instructions;
// the parts and `notAsked` are its checklist, never a replacement for them.
//
// A part's quote is a verbatim span of one active instruction source --
// exactly as written, not a paraphrase -- so a part the supervisor invented
// has nothing to quote and is refused. A lasting act is one of the permission
// gate's consequence classes, so every act a part asks for is one the gate
// already knows how to ask a person about.
//
// **Parts of one instruction do not overlap (A8 wave 10 crossborder, t638).**
// `run-mv9q50ui-1736d010` quoted the whole request as part p1 and a span
// inside it as p2, so the first builder did the whole task and every later
// builder found its part already done. Each quote is placed where it stands in
// its source, and two parts of one source whose spans share a character are
// refused `project.quote_overlaps`. A quote found more than once takes the
// first place no earlier part holds, so words a person repeats are not read as
// an overlap.
//
// **An amendment keeps the person's request (A8 frozen pair 3 bigbox, t645).**
// `run-mv9zn5ob-d929084d` amended its plan to leave the person's first request
// out of every part and list it under `notAsked`, and from then on the build
// could only fail. An amendment's parts must still quote every stretch of the
// person's words the plan in force quotes: they may be split or joined
// differently, and a stretch of at most `EDGE_WORDS` words may fall away where
// parts are reworded or re-split (the rewording `../supervisor/state.ts` keeps a
// proposal across), but a longer stretch, or every word of a part, is refused
// `project.plan_part_dropped`, naming the part and the words dropped. A
// `notAsked` item the amendment adds that holds a part's words, or is held in
// them, is refused under the same code. Core measures the text and nothing
// else; giving a part up is an honest ending, never a plan without it.
//
// **A part that asks for records says so (t757).** Auction
// `run-mveba82m-fd0616dc` asked for a record with three columns; the Flow read
// three values, stored no record set, and every judge said yes with
// `recordSetCount 0` in front of it. Nothing typed said the request wanted
// records, and Core may not infer that from the request's words. So a part may
// declare `answer: { kind: "records", columns }`: the answer it asks for is
// records, with the columns the request names (none named, an empty list). A
// judge's yes on a run that stored none is then held
// (`../../result-verification/requested-output/`). Absent, the part asks for an
// act, or a read nobody owes records for, as every part did before; a spec
// digested before the field existed keeps its digest.

export type AutomationStudioProjectTaskPart = {
  id: string;
  quote: { sourceId: string; text: string };
  goalFacts: string[];
  lastingActs: AutomationStudioActionConsequence[];
  /** The answer the part asks for, where it is records (header, t757). Absent, none is owed. */
  answer?: AutomationStudioProjectTaskAnswer;
};

/** A part's declared answer (header, t757): records, with the columns the request names, in its order. */
export type AutomationStudioProjectTaskAnswer = { kind: "records"; columns: string[] };

export type AutomationStudioProjectTaskSpec = {
  parts: AutomationStudioProjectTaskPart[];
  notAsked: string[];
  digest: string;
};

const VERSION = "project.task_spec.v1";
const LIMITS = { parts: 50, quote: 4000, facts: 50, fact: 500, notAsked: 50, columns: 50, column: 200 } as const;
const ANSWER_KINDS = ["records"] as const;

export const automationStudioProjectTaskSpec = Object.freeze({
  /** The digest of a spec's content; the `digest` field is excluded. */
  digest(spec: Omit<AutomationStudioProjectTaskSpec, "digest">): string {
    return automationStudioProjectDigest(VERSION, { parts: spec.parts, notAsked: spec.notAsked });
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

/** One issue of an amendment that drops the person's words (header, t645): the part of the plan in force and the words it lost. */
export type AutomationStudioProjectDroppedIssue = { code: string; path: string; part: string; dropped: string };

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
  const fields = shape.object(value, "taskSpec", ["parts", "notAsked", "digest"]);
  const rawParts = shape.array(fields.parts, "taskSpec.parts", LIMITS.parts);
  if (!rawParts.length) return shape.refuse("project.task_spec_empty", "taskSpec.parts");
  const parts = rawParts.map((part, index) => readPart(part, `taskSpec.parts.${index}`));
  if (new Set(parts.map((part) => part.id)).size !== parts.length) return shape.refuse("project.duplicate_part", "taskSpec.parts");
  const notAsked = shape.array(fields.notAsked, "taskSpec.notAsked", LIMITS.notAsked).map((item, index) => shape.text(item, `taskSpec.notAsked.${index}`, LIMITS.fact));
  const digest = shape.digest(fields.digest, "taskSpec.digest");
  if (digest !== automationStudioProjectTaskSpec.digest({ parts, notAsked })) return shape.refuse("project.task_spec_digest_mismatch", "taskSpec.digest");
  return { parts, notAsked, digest };
}

function readPart(value: unknown, path: string): AutomationStudioProjectTaskPart {
  const fields = shape.object(value, path, ["id", "quote", "goalFacts", "lastingActs"], ["answer"]);
  const quote = shape.object(fields.quote, `${path}.quote`, ["sourceId", "text"]);
  const lastingActs = shape.array(fields.lastingActs, `${path}.lastingActs`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length)
    .map((act, index) => shape.oneOf(act, `${path}.lastingActs.${index}`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES));
  if (new Set(lastingActs).size !== lastingActs.length) return shape.refuse("project.duplicate", `${path}.lastingActs`);
  return {
    id: shape.id(fields.id, `${path}.id`),
    quote: { sourceId: shape.id(quote.sourceId, `${path}.quote.sourceId`), text: shape.text(quote.text, `${path}.quote.text`, LIMITS.quote) },
    goalFacts: shape.array(fields.goalFacts, `${path}.goalFacts`, LIMITS.facts).map((fact, index) => shape.text(fact, `${path}.goalFacts.${index}`, LIMITS.fact)),
    lastingActs,
    ...(fields.answer !== undefined ? { answer: readAnswer(fields.answer, `${path}.answer`) } : {})
  };
}

/** A part's declared answer (header, t757): a known kind and distinct column names. */
function readAnswer(value: unknown, path: string): AutomationStudioProjectTaskAnswer {
  const fields = shape.object(value, path, ["kind", "columns"]);
  const kind = shape.oneOf(fields.kind, `${path}.kind`, ANSWER_KINDS);
  const columns = shape.array(fields.columns, `${path}.columns`, LIMITS.columns).map((column, index) => shape.text(column, `${path}.columns.${index}`, LIMITS.column));
  if (new Set(columns).size !== columns.length) return shape.refuse("project.duplicate", `${path}.columns`);
  return { kind, columns };
}
