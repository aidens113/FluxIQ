import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultWitnessMove } from "./witness-move.ts";

type SiteChange = NonNullable<AutomationStudioRunResultSummary["siteChange"]>;
type Witness = SiteChange["witnesses"][number];

/** A word that numbers a step, a pass, a row or a page rather than counting what a part asks for: the number after it is no count. */
const ORDINAL_BEFORE = new Set(["step", "steps", "pass", "passes", "row", "rows", "condition", "conditions", "node", "page", "pages", "call", "trial", "number", "no"]);
/** Words of a part's `what` that say nothing of what it counts. */
const FILLER = new Set(["the", "and", "for", "with", "from", "each", "every", "one", "any", "that", "this", "into", "onto", "per", "new", "more", "their", "its", "all"]);
/** Where a sentence turns from one clause to another. */
const CLAUSE_BREAK = /;|:\s|,\s*(?:but|and|yet|however|while|whereas|though|although|so)\b|\s(?:but|however|whereas|yet)\s/iu;

/**
 * A no's sentence that states an absolute count of what a change part asks
 * for, where Core read the part's change as exactly what it asks (`./index.ts`,
 * t775): refuted, with Core's change line as the finding. Nothing where the
 * sentence makes no such claim, where any of its clauses says something else,
 * or where no part's change matches its ask.
 */
export function automationStudioResultChangeCountClaim(sentence: string, siteChange: SiteChange | undefined): { refuted: true; finding: string } | undefined {
  if (!siteChange) return undefined;
  const clauses = sentence.split(CLAUSE_BREAK).map((clause) => clause.trim()).filter(Boolean);
  for (const part of matchedParts(siteChange)) {
    const kinds = clauses.map((clause) => clauseKind(clause, part.words, part.places, part.count));
    if (!kinds.includes("claim") || kinds.includes("other")) continue;
    return { refuted: true, finding: part.line };
  }
  return undefined;
}

type Matched = { count: number; words: string[]; places: string[]; line: string };

/** Each change part with a numeric count whose proof is `shown` and whose every witness changed by exactly that count, with Core's change line. */
function matchedParts(siteChange: SiteChange): Matched[] {
  const matched: Matched[] = [];
  for (const proof of siteChange.proofs) {
    const effect = proof.effect;
    if (proof.proof !== "shown" || effect.kind !== "change" || typeof effect.count !== "number") continue;
    const witnesses = siteChange.witnesses.filter((witness) => witness.parts.includes(proof.part));
    const said = witnesses.map((witness) => changeSaid(witness, effect.direction, effect.count as number));
    if (!witnesses.length || said.some((one) => one === undefined)) continue;
    const words = contentStems(effect.what);
    if (!words.length) continue;
    const read = witnesses.map((witness, index) => `${witness.where ? `"${witness.where}"` : `place ${witness.id}`}: ${said[index]}`).join("; ");
    matched.push({
      count: effect.count,
      words,
      places: witnesses.flatMap((witness) => contentStems(witness.where ?? "")),
      line: `Core read where part "${proof.part}"'s change shows just before this trial and just after it -- ${read} -- which is the change it asks for (${effect.direction} ${effect.count} ${effect.what}). What those places held before the trial was already there and is not this trial's doing, so their total after it is not the count asked for.`
    });
  }
  return matched;
}

/**
 * Core's words for a witness's change where it is exactly `count` in
 * `direction`; nothing otherwise. A list place's move is its rows added or
 * removed and each changed row's one moved whole number
 * (`./witness-move.ts`), all in the asked direction: a list at 9 that is 10
 * after a part asking to add 1 has had 1 added. A control place's direction
 * cannot be told from its states, so any `count` controls moved matches.
 */
function changeSaid(witness: Witness, direction: "adds" | "removes", count: number): string | undefined {
  const change = witness.change;
  if (typeof change !== "object") return undefined;
  if ("added" in change) {
    const move = automationStudioResultWitnessMove(witness);
    if (!move) return undefined;
    const sign = direction === "adds" ? 1 : -1;
    const against = direction === "adds" ? move.removed : move.added;
    if (against !== 0 || move.moves.some((one) => Math.sign(one.by) !== sign) || move.total !== sign * count) return undefined;
    return move.words;
  }
  let moved = 0;
  for (const label of new Set([...Object.keys(change.from), ...Object.keys(change.to)])) moved += Math.max(0, (change.to[label] ?? 0) - (change.from[label] ?? 0));
  return moved === count ? `${count} control${count === 1 ? "" : "s"} moved from one state to another` : undefined;
}

/**
 * `claim`: a count of what the part asks for other than its own; `restates`:
 * only its own count; `other`: words of something else; `none`: too few words
 * to say anything. A count is a numeral followed within two words by a word of
 * the part's `what`, or by a word of where its change shows, or that such a
 * place's word comes within three words before ("the list now has 10").
 */
function clauseKind(clause: string, words: readonly string[], places: readonly string[], count: number): "claim" | "restates" | "other" | "none" {
  const tokens = clause.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const counts: number[] = [];
  tokens.forEach((token, index) => {
    if (!/^\d+$/u.test(token) || ORDINAL_BEFORE.has(tokens[index - 1]?.toLowerCase() ?? "")) return;
    const after = tokens.slice(index + 1, index + 3).map(stem);
    const before = tokens.slice(Math.max(0, index - 3), index).map(stem);
    if (after.some((next) => words.includes(next) || places.includes(next)) || before.some((prior) => places.includes(prior))) counts.push(Number(token));
  });
  if (counts.some((stated) => stated !== count)) return "claim";
  if (counts.length) return "restates";
  return tokens.filter((token) => /\p{L}/u.test(token)).length >= 3 ? "other" : "none";
}

function contentStems(text: string): string[] {
  return [...new Set(text.split(/[^\p{L}]+/u).filter((word) => word.length >= 3 && !FILLER.has(word.toLowerCase())).map(stem))];
}

/** A word lowercased, a plural's ending taken off: "holds" and "hold" read alike. */
function stem(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3) return lower.slice(0, -1);
  return lower;
}
