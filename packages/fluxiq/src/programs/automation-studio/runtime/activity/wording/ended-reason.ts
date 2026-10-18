// Why the supervisor ended a build, as the person may read it (t567 lane 4).
//
// The supervisor writes its ending's reason itself, and it reached the chat
// screened only for ids: "the single subflow save halvard jobs was briefed
// twice and both builders failed with flow bootstrap.… (bootstrap.source port
// cardinality) plus repeat refusals, so no proposal was produced". The
// supervisor is told the person reads it and must use plain words
// (`project-agents/supervisor/guidance.ts`, `completion.ts`); this is the
// backstop for when it does not (`service/project-build/run.ts`). Before the
// reason screen every reason passes (`./reason-text.ts`):
//
// - an aside in parentheses that holds a code is left out;
// - a sentence, or a clause between semicolons, that holds a dotted code
//   (`a.b_c`, `flow_bootstrap.plan_invalid`) or names the build's own
//   machinery (its subflows, briefs, builders, proposals, ports, the ledger's
//   lasting acts, its supervisor) is left out whole, since a person can act on
//   none of it and half a sentence reads worse than none.
//
// A code is told from an address or "e.g." by the `_` inside it. What is left
// may be nothing, and then the chat says Core's words alone. The reason as
// written stays in the build record and the run's evidence.

import { automationStudioActivityReasonText } from "./reason-text.ts";

/** A code: lower-case words joined by `.` or `_`, with a `_` among them (`web.dom_read`, `repeat_without_progress`). */
const CODE = /\b[a-z][a-z0-9]*(?:\.[a-z0-9]+)*_[a-z0-9]+(?:[._][a-z0-9]+)*\b/u;
/** A dotted code: a code with a `.` in it. */
const DOTTED = /\b[a-z][a-z0-9_]*\.[a-z0-9_.]*[a-z0-9]\b/gu;
/** An aside in parentheses with a code in it: `(bootstrap.source_port_cardinality)`, `(repeat_without_progress)`. */
const CODE_ASIDE = new RegExp(String.raw`\s*\([^()]*${CODE.source}[^()]*\)`, "gu");
/** The build's own machinery, which a person cannot act on. */
const MACHINERY = /\b(?:sub-?flows?|briefs?|briefed|briefing|builders?|proposals?|bootstrap|evidence[- ]loop|ports?|cardinality|declared|lasting acts?|supervisor|digest|revisions?|receipts?|dispatch(?:ed|es)?|assembl(?:e|ed|y|ing)|candidates?|refusals?|ledger)\b/iu;

/** The pieces of `text`: sentences, and clauses between semicolons. */
function pieces(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+/u).map((piece) => piece.trim()).filter((piece) => piece);
}

/** Whether `piece` holds a dotted code (header): a dotted word with a `_` in it. */
function holdsDottedCode(piece: string): boolean {
  return [...piece.matchAll(DOTTED)].some((match) => match[0].includes("_"));
}

/**
 * `reason` as the person may read it (header), within `max` characters, or
 * undefined when nothing of it is plain.
 */
export function automationStudioActivityEndedReason(reason: unknown, max: number): string | undefined {
  if (typeof reason !== "string") return undefined;
  const all = pieces(reason.replace(CODE_ASIDE, "")).map((piece) => piece.replace(/\s+([,.;:!?])/gu, "$1").replace(/\s+/gu, " ").trim());
  const plainPiece = (piece: string | undefined) => piece !== undefined && !MACHINERY.test(piece) && !holdsDottedCode(piece) && /\p{L}{2}/u.test(piece);
  // A clause whose next was left out ends as a sentence: "...given;" read as unfinished.
  const kept = all.flatMap((piece, index) => (plainPiece(piece) ? [plainPiece(all[index + 1]) ? piece : piece.replace(/[;,:]$/u, ".")] : []));
  const plain = kept.join(" ");
  return plain ? automationStudioActivityReasonText(plain, max) : undefined;
}
