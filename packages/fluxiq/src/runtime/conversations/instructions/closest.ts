// Matching a name nobody declared to the one that was meant.
//
// FluxIQ's standing rule for every name it is handed -- a node, a parameter, a
// capability -- is that an unknown one resolves to its closest match rather
// than being refused. A model that writes `flow.run` when the panel says
// `run.execute`, `flow` when the argument is `flowId`, or "kettle" when the
// Flow is called "Kettle price checker" has said perfectly clearly what it
// meant. The answer carries a confidence, so whoever acts on it can say which
// one it took and let the person correct it.
//
// Three signals, and the strongest wins. Spelling -- edit distance on the name
// squeezed to letters and digits -- catches a typo in a single name. Words --
// how many of the query's words the candidate's id, title and phrases account
// for -- catches a name said differently. Containment catches a short name
// inside a longer one. Spelling is only compared for a query that is one name
// rather than a sentence, because the edit distance between two sentences says
// nothing about what either means.

/** A name to match against, and the other ways it is known: a title, phrases, a Flow's own name. */
export type AutomationStudioNamedCandidate = {
  key: string;
  labels?: readonly string[];
};

export type AutomationStudioClosestNameMatch = {
  key: string;
  /** 0 to 1. One is an exact match. */
  confidence: number;
};

const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "could", "do", "for", "from", "i", "in", "is", "it", "its",
  "me", "my", "of", "on", "or", "our", "please", "the", "this", "that", "to", "up", "we", "with", "you", "your"
]);

/** The words a name or a sentence is made of: camelCase and dotted ids split, lower-cased, filler dropped. */
export function automationStudioNameWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/**
 * The candidate `query` most likely meant, or null only when there are no
 * candidates at all. Never a refusal: the weakest match is still returned, with
 * its confidence, and the caller decides what a low one means.
 */
export function automationStudioClosestName(query: string, candidates: readonly AutomationStudioNamedCandidate[]): AutomationStudioClosestNameMatch | null {
  let best: AutomationStudioClosestNameMatch | null = null;
  for (const candidate of candidates) {
    const confidence = scoreName(query, candidate);
    if (!best || confidence > best.confidence) best = { key: candidate.key, confidence };
  }
  return best;
}

function scoreName(query: string, candidate: AutomationStudioNamedCandidate): number {
  const squeezedQuery = squeeze(query);
  if (!squeezedQuery) return 0;
  const names = [candidate.key, ...(candidate.labels ?? [])];
  if (query.trim() === candidate.key) return 1;
  let score = 0;
  const oneName = !/\s/u.test(query.trim());
  for (const name of names) {
    const squeezedName = squeeze(name);
    if (!squeezedName) continue;
    if (squeezedName === squeezedQuery) score = Math.max(score, 0.95);
    if (oneName) score = Math.max(score, 0.9 * similarity(squeezedQuery, squeezedName));
    if (squeezedQuery.length >= 3 && squeezedName.includes(squeezedQuery)) {
      score = Math.max(score, 0.6 + 0.3 * (squeezedQuery.length / squeezedName.length));
    }
  }
  return Math.max(score, wordScore(query, candidate));
}

/** How much of the query the candidate accounts for, preferring a candidate whose own name is no wider than it needs to be. */
function wordScore(query: string, candidate: AutomationStudioNamedCandidate): number {
  const asked = new Set(automationStudioNameWords(query));
  if (!asked.size) return 0;
  const primary = new Set([...automationStudioNameWords(candidate.key), ...automationStudioNameWords(candidate.labels?.[0] ?? "")]);
  const known = new Set([...primary, ...(candidate.labels ?? []).flatMap(automationStudioNameWords)]);
  let covered = 0;
  for (const word of asked) if (known.has(word)) covered += 1;
  if (!covered) return 0;
  const coverage = covered / asked.size;
  let shared = 0;
  for (const word of asked) if (primary.has(word)) shared += 1;
  const tightness = primary.size ? shared / new Set([...primary, ...asked]).size : 0;
  return 0.85 * coverage * (0.6 + 0.4 * tightness);
}

function squeeze(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

/** One minus the edit distance over the longer length: 1 for the same string, falling toward 0. */
function similarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - editDistance(left, right) / longest : 1;
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1);
      current.push(Math.min(previous[column]! + 1, current[column - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[right.length]!;
}
