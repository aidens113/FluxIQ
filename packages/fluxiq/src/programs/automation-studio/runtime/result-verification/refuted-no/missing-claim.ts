// A no's claim that rows are missing from the result (t607).
//
// **Why.** A8 everything-store `run-mv8p0p7c-c8412344`, whole test 1: one judge
// said two rows of the last page "qualify" and are absent from the stored
// rows. Core's read had seen both and left each out by a condition whose value
// Core read on that row itself -- one was a sponsored slot, the other showed no
// membership marker -- so the claim was the judge's misreading of the row, not
// a defect of the Flow.
//
// **What Core holds.** The rows the result stores, and per read and condition
// the rows that condition alone left out, with the ones Core settled: their
// tested value, read by Core, fails the condition as written
// (`../value-readings/settled-rows.ts`). A sentence saying named rows are
// missing, absent, not in the result, not included, or were left out, dropped
// or excluded is refuted when every row it names is in the stored rows, or was
// left out by a condition Core settled for that row -- unless the sentence
// speaks of a condition, filter or bound itself, where the claim is that the
// condition is wrong, which Core's reading of the row against it does not
// settle. A row Core cannot find, or one a condition left out unsettled, is the
// judge's to weigh.
//
// **Unless the condition only restates the request (t629).** A8 bigbox
// `run-mv9dcztz-f16d6b5a`: three nos over an exact answer said "missing
// qualifying rows ..." and "condition 4 ... dropped 8 rows including ...",
// every row named one a text condition alone left out whose text is the
// request's own words, word for word, and on which Core's read found a value
// failing it. The first wording was no claim here at all, and the second was
// exempt as a dispute of the condition, so a misreading of the row counted as a
// no, and two of them banned the exact revision. So the words that say rows are
// missing include the attributive and the generic forms ("missing qualifying
// rows", "Missing rows:", "not included", "should be included", "dropped 8 rows
// including"), and a sentence that speaks of the condition is still refuted
// where every row it names is settled by a condition testing the request's own
// words over a read that kept rows (`./request-text-test.ts`, `./record.ts`):
// what is disputed is then the row's value, which Core read. A condition whose
// words the request does not state stays the judge's to weigh.
//
// **And a row only a test of its own name left out is disputed whatever the
// words (t651).** A8 frozen pair 4 `run-mva446jf-926a3c72`: a condition kept
// rows whose title starts with the store's house name, as a stand-in for "sold
// by the store itself". A row it left out fails it as written, but Core read
// only the row's name, which the judge sees too: a judge cannot misread it, so
// calling such a row missing says the condition is wrong, as a sentence that
// names it does (`./record.ts`, `testsLabel`). Such a sentence stands. A row
// left out by a condition over a column of its own is refuted as before.
//
// **And a row no read saw (t654).** Before a sentence naming only rows Core
// holds no record of is left standing, it is asked whether it says a condition
// left out a row no read ever saw, where Core can list every row each read saw
// and a step acted on the page first (`./unseen-row-claim.ts`): no condition
// saw that row, so none missed it.
//
// **Each clause its own (t659).** A8 frozen pair 6 project towels
// `run-mvac0nmw-52ed30b2` step 0125: "the kept set includes ... "<stored row>"
// (a holder ...) and "<left-out row>" was left out only by rating" -- the words
// for missing were given to the stored row too, refuted as "is in the stored
// rows", and the reading labelled wholly contradicted. So, with Core's record
// in hand, the words for missing count only for the rows of the clauses that
// say them (`automationStudioResultRowClauses`, below); a row a clause says is kept is no row called
// missing (`automationStudioResultKeptRowClaim`, below, holds that claim to stand). Where a clause cut
// loses a row the whole sentence names, the sentence is read whole, as before.
//
// **And a stored label is never missing (t659).** Step 0127: "condition 1 left
// out "<label>" and "<label>"", where another copy of each was a stored row.
// Core measured that the item came back, whatever the sentence says of the
// condition. So a clause that says a condition left out, dropped or excluded
// what follows (`left_out_by`), where every row it names is a stored row of
// which a condition also left a copy out, is refuted too: "<label> is in the
// stored rows: another copy of it was kept". A stored row with no left-out copy
// is not read so: "condition 3 excludes holders but <row> got through" says it
// was kept. Whether the condition is the request's stays with
// `./advice-condition.ts`.
//
// **Only the clauses that name a row (t665).** A8 frozen pair 8 candidate towels
// `run-mvam0lys-2d3eb090` step 0069: "condition 1 dropped rows that are ...:
// eg <stored A> (...) and <stored B> (...)". The colon-ended lead clause says
// the rows are left out and names none; the rows follow. Requiring every
// `left_out_by` clause to name a stored row read nothing, and the false
// "dropped" stood. So only the `left_out_by` clauses that name a row, or a row
// Core cannot find, are held to that test, and at least one must: a clause
// naming no row ("the request only says to leave out ...") says nothing of
// which rows came back.

import { automationStudioResultLeftOutFinding } from "./left-out-finding.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows, AutomationStudioResultNoRecord } from "./types.ts";
import { automationStudioResultUnseenRowClaim } from "./unseen-row-claim.ts";

/** Words that speak of a row's cell: a stored row said to lack a value is no row called missing (t629). */
const SPEAKS_OF_A_CELL = /\b(?:columns?|values?|fields?|cells?)\b/iu;
/** Words that speak of a condition itself. */
const SPEAKS_OF_A_CONDITION = /\b(?:conditions?|filters?|bounds?|thresholds?|criteri(?:on|a)|cut-?off)\b/iu;

/** The rows a sentence calls missing (header). */
type Called = Pick<AutomationStudioResultNoNamedRows, "stored" | "leftOut">;

/**
 * The claim a sentence makes that named rows are missing (header); nothing
 * where it makes none or names no row. `record`, where given, scopes the words
 * for missing to their own clauses (t659); without it the sentence is read whole.
 */
export function automationStudioResultMissingClaim(sentence: string, named: AutomationStudioResultNoNamedRows, record?: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  // A condition said to have left out a row no read saw (header, t654), whatever the words for missing.
  if (named.unmatched && !named.stored.length && !named.leftOut.length) {
    const unseen = automationStudioResultUnseenRowClaim(sentence, named);
    if (unseen) return unseen;
  }
  const called = record ? calledMissing(sentence, named, record) : automationStudioResultSaysMissing(sentence) ? named : undefined;
  if (!called) return undefined;
  if (!called.stored.length && !called.leftOut.length) return named.unmatched ? { refuted: false } : undefined;
  if (named.unmatched) return { refuted: false };
  // A stored row said to lack a value is a claim about its cell, which Core does not check here: the wider words above say "not included" of a column too.
  if (called.stored.length && SPEAKS_OF_A_CELL.test(sentence)) return { refuted: false };
  const speaksOfACondition = SPEAKS_OF_A_CONDITION.test(sentence);
  const findings: string[] = [];
  for (const label of new Set(called.stored.map((row) => row.label))) findings.push(storedFinding(label, record));
  const byLabel = new Map<string, typeof called.leftOut>();
  for (const row of called.leftOut) byLabel.set(row.label, [...(byLabel.get(row.label) ?? []), row]);
  for (const rows of byLabel.values()) {
    if (!rows.every((row) => row.settled)) return { refuted: false };
    // A dispute of the condition stands, unless the condition tests the request's own words and Core read the row failing them (header, t629); a row a name test left out is disputed whatever the words (header, t651).
    const disputesCondition = speaksOfACondition || rows.some((row) => row.testsLabel === true);
    if (disputesCondition && !rows.every((row) => row.quotesRequest)) return { refuted: false };
    for (const row of rows) findings.push(automationStudioResultLeftOutFinding(row));
  }
  return { refuted: true, finding: findings.join(" ") };
}

/**
 * The rows the clauses saying them call missing (header, t659): the rows of
 * each `missing` clause, and of each `left_out_by` clause whose rows are all
 * stored; the whole sentence's rows where a clause cut loses one, or the words
 * for missing run across a cut.
 */
function calledMissing(sentence: string, named: AutomationStudioResultNoNamedRows, record: AutomationStudioResultNoRecord): Called | undefined {
  const clauses = automationStudioResultRowClauses(sentence).map((clause) => ({ ...clause, rows: automationStudioResultSentenceRows(clause.text, record) }));
  const labels = new Set(clauses.flatMap((clause) => [...clause.rows.stored, ...clause.rows.leftOut].map((row) => row.label)));
  const lost = [...named.stored, ...named.leftOut].some((row) => !labels.has(row.label));
  const missing = clauses.filter((clause) => clause.says === "missing");
  if (lost || (!missing.length && automationStudioResultSaysMissing(sentence))) return automationStudioResultSaysMissing(sentence) ? named : undefined;
  const leftOutBy = clauses.filter((clause) => clause.says === "left_out_by");
  // A condition said to have left out only rows the result stores, each a label a condition also left a copy of (header, t659); only the clauses naming a row (header, t665).
  const copied = (label: string): boolean => record.leftOut.some((row) => row.label === label);
  const naming = leftOutBy.filter((clause) => clause.rows.stored.length > 0 || clause.rows.leftOut.length > 0 || clause.rows.unmatched);
  const storedOnly = naming.length > 0 && naming.every((clause) =>
    clause.rows.stored.length > 0 && !clause.rows.leftOut.length && !clause.rows.unmatched && clause.rows.stored.every((row) => copied(row.label)));
  const saying = [...missing, ...(storedOnly ? naming : [])];
  if (!saying.length) return undefined;
  return { stored: unique(saying.flatMap((clause) => clause.rows.stored)), leftOut: unique(saying.flatMap((clause) => clause.rows.leftOut)) };
}

/** Core's words for a stored row called missing: another copy of it was kept, where a condition left one out (header, t659). */
function storedFinding(label: string, record: AutomationStudioResultNoRecord | undefined): string {
  const copy = record?.leftOut.some((row) => row.label === label) === true;
  return copy ? `"${label}" is in the stored rows: another copy of it was kept.` : `"${label}" is in the stored rows.`;
}

function unique<T>(rows: readonly T[]): T[] {
  return [...new Set(rows)];
}

// The clauses of one sentence of a no, each with what it says of the rows it
// names: missing from the result, left out by a condition, or kept (t659).
//
// **Why.** A8 frozen pair 6 project towels `run-mvac0nmw-52ed30b2` step 0125:
// "the kept set includes non-<item> items: "<stored row>" (a holder, ...) and
// "<left-out row>" was left out only by rating." The words for missing ("was
// left out") belong to the second row only, but this claim gave them
// to every row the sentence named, so the stored row became a row called
// missing, refuted as "is in the stored rows", and the whole reading was
// labelled contradicted. The sentence's real claim, that a stored row is the
// wrong kind, was read by nothing.
//
// **Clauses.** A sentence splits, outside quotes and brackets, at ";", at ", but",
// at ": " and at " and " (or ", and ") just before a quote. Each clause says of
// its rows what its own words say:
//
// - `missing`: the words a no calls rows missing by (`MISSING`, t607, t629);
// - `left_out_by`: a condition, a filter or "it" said to have left out, dropped,
//   excluded, removed or missed what follows (`LEFT_OUT_BY`), active voice;
// - `kept`: the words that say the result holds them ("includes", "contains",
//   "kept", "keeps").
//
// A clause with none of them shares its neighbour's: the clause a colon ends
// before it, else the next clause that says one ("A and B were left out"),
// else the last one before it -- never across ", but". A semicolon cuts a
// clause but not a list: "Missing rows: A; B" calls both missing, as the
// hardware drill reading of t651 does.

/** The nouns a judge calls the result's rows by. Generic, never any site's. */
const ROWS = String.raw`(?:rows?|records?|items?|entries|listings?|products?)`;
/** Words that may stand between "missing" and the rows: generic qualifiers and counts, never a column. */
const QUALIFIERS = String.raw`(?:(?:several|some|many|other|more|the|all|\d+|qualifying|required|requested|eligible|valid|matching|expected|relevant)\s+){0,3}`;
/** Words that say rows are not in the result, said of the run (never "should be left out"): `../missing-claim.ts`'s words. */
const MISSING = new RegExp([
  String.raw`\b(?:is|are|was|were)\s+(?:missing|absent|not\s+(?:among|stored|kept|included|returned))\b`,
  String.raw`\bmissing\s+from\b`,
  String.raw`\babsent\s+from\b`,
  String.raw`\b(?:was|were|been|got)\s+(?:left\s+out|dropped|excluded|filtered\s+out|omitted|rejected)\b`,
  String.raw`\bnot\s+in\s+the\s+(?:stored\s+rows|result|answer|output)\b`,
  String.raw`\b(?:dropped|omitted)\s+(?:it|them|these|those|both)\b`,
  // t629: the attributive and the generic forms.
  String.raw`\bmissing\s*:`,
  String.raw`\bmissing\s+${QUALIFIERS}${ROWS}\b`,
  String.raw`\bnot\s+included\b`,
  String.raw`\b(?:should|must)\s+(?:also\s+)?(?:have\s+been|be)\s+(?:included|kept|stored|listed|returned|in\s+the\s+(?:result|answer|output))\b`,
  String.raw`\bleft\s+(?:it|them|these|those|both)\s+out\b`,
  String.raw`\b(?:dropped|omitted|excluded|removed|left\s+out|filtered\s+out)\s+(?:\d+\s+)?(?:[\p{L}-]+\s+)?${ROWS}\s+(?:including|such\s+as|like)\b`
].join("|"), "iu");
/** A condition, filter or pronoun said, in the active voice, to have left out what follows (t659). Generic, never any site's. */
const LEFT_OUT_BY = /\b(?:condition\s+\d+|conditions?|filters?|tests?|checks?|it|this|which|that|they)\s+(?:also\s+|wrongly\s+|incorrectly\s+)?(?:has\s+|have\s+)?(?:left\s+out|leaves\s+out|dropped|drops|excluded|excludes|removed|removes|filtered\s+out|filters\s+out|omitted|omits|rejected|rejects|missed|misses)\b/iu;
/** Words that say the result holds what follows. */
const KEPT = /\b(?:includes?|included|including|contains?|contained|containing|kept|keeps|holds|retains?|retained)\b/iu;

/** What a clause says of the rows it names (header). */
export type AutomationStudioResultRowClauseSays = "missing" | "left_out_by" | "kept";

/** One clause, and what it says of its rows, its own or shared (header). */
export type AutomationStudioResultRowClause = { text: string; says?: AutomationStudioResultRowClauseSays | undefined };

/** Whether a whole sentence says rows are missing, by `MISSING` alone: what a sentence read without clauses is held to. */
function automationStudioResultSaysMissing(sentence: string): boolean {
  return MISSING.test(sentence);
}

/** A sentence's clauses, each with what it says of its rows (header). */
export function automationStudioResultRowClauses(sentence: string): AutomationStudioResultRowClause[] {
  const pieces = split(sentence, false);
  const own = pieces.map((piece) => saysOf(piece.text));
  return pieces.map((piece, at) => ({ text: piece.text, says: own[at] ?? shared(pieces, own, at) }));
}

type Piece = { text: string; colon: boolean; group: number };

/** What one clause's own words say of its rows; nothing where they say none of it. */
function saysOf(text: string): AutomationStudioResultRowClauseSays | undefined {
  if (MISSING.test(text)) return "missing";
  if (LEFT_OUT_BY.test(text)) return "left_out_by";
  return KEPT.test(text) ? "kept" : undefined;
}

/** What a clause with no words of its own shares (header): the colon before it, else the next that says, else the last that said. */
function shared(pieces: readonly Piece[], own: ReadonlyArray<AutomationStudioResultRowClauseSays | undefined>, at: number): AutomationStudioResultRowClauseSays | undefined {
  const group = pieces[at]!.group;
  for (let back = at - 1; back >= 0 && pieces[back]!.group === group; back -= 1) {
    if (own[back] !== undefined) {
      if (pieces[back]!.colon) return own[back];
      break;
    }
  }
  for (let next = at + 1; next < pieces.length && pieces[next]!.group === group; next += 1) if (own[next] !== undefined) return own[next];
  for (let back = at - 1; back >= 0 && pieces[back]!.group === group; back -= 1) if (own[back] !== undefined) return own[back];
  return undefined;
}

/**
 * A sentence's clauses as its reasons are weighed one by one (`./weigh.ts`,
 * t665): cut as above, and also at every ", and " outside quotes and brackets,
 * since "the filter keeps X, and condition 3 drops them" gives two reasons.
 */
export function automationStudioResultReasonClauses(sentence: string): string[] {
  return split(sentence, true).map((piece) => piece.text);
}

/** The sentence cut into clauses outside quotes and brackets (header); `everyAnd` cuts at each ", and " too. */
function split(sentence: string, everyAnd: boolean): Piece[] {
  const pieces: Piece[] = [];
  let group = 0;
  let from = 0;
  let quoted = false;
  let depth = 0;
  const cut = (end: number, next: number, colon: boolean, newGroup: boolean): void => {
    const text = sentence.slice(from, end).trim();
    if (text) pieces.push({ text, colon, group });
    if (newGroup) group += 1;
    from = next;
  };
  for (let at = 0; at < sentence.length; at += 1) {
    const char = sentence[at]!;
    if (char === "\"") quoted = !quoted;
    else if (char === "“") quoted = true;
    else if (char === "”") quoted = false;
    if (quoted || char === "\"" || char === "”") continue;
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    if (depth > 0) continue;
    const rest = sentence.slice(at);
    if (char === ";") cut(at, at + 1, false, false);
    else if (char === ":" && /^:(?:\s|$)/u.test(rest)) cut(at + 1, at + 1, true, false);
    else if (/^,\s+but\s/iu.test(rest)) cut(at, at + 1, false, true);
    else {
      const and = (everyAnd ? /^,\s+and\s+|^,?\s+and\s+(?=["“])/iu : /^,?\s+and\s+(?=["“])/iu).exec(rest);
      if (and && /\S/u.test(sentence.slice(from, at))) cut(at, at + and[0].length, false, false);
    }
  }
  cut(sentence.length, sentence.length, false, false);
  return pieces;
}

// A no's claim about a stored row it says the result keeps, beside rows it
// calls missing (t659).
//
// **Why.** A8 frozen pair 6 project towels `run-mvac0nmw-52ed30b2` step 0125:
// "the kept set includes non-<item> items: "<stored row>" (a holder, ...) and
// "<left-out row>" was left out only by rating." Once the words for missing
// count only for their own clause (above),
// the left-out row is refuted, and nothing reads the first clause: that a
// stored row is the wrong kind of thing. That is about what the row is, which
// Core does not measure, so it is a reason Core cannot refute. Without it the
// sentence was refuted whole, the reading labelled wholly contradicted, and a
// retest advised on a no that named a real defect.
//
// **The rule.** Where a sentence has a clause calling rows missing or left out,
// and another clause saying the result includes, contains or kept a stored row,
// that second clause is a claim that stands. Core's findings on the rest are
// still said, so the reading is at most partly contradicted. Where the sentence
// calls nothing missing, this claim is not made: the sentence is read as it
// always was, and a stored row called an excluded kind its own words say it is
// not is `./excluded-kind-claim.ts`'s to weigh, which `./weigh.ts` asks first.

/** The standing claim a sentence makes about a stored row it says is kept, beside rows it calls missing (header); nothing otherwise. */
export function automationStudioResultKeptRowClaim(sentence: string, record: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  const clauses = automationStudioResultRowClauses(sentence);
  if (!clauses.some((clause) => clause.says === "missing" || clause.says === "left_out_by")) return undefined;
  const kept = clauses.filter((clause) => clause.says === "kept").some((clause) => automationStudioResultSentenceRows(clause.text, record).stored.length > 0);
  return kept ? { refuted: false } : undefined;
}
