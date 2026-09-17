// Ranking node definitions against an instruction so the catalog handed to a
// provider leads with what the instruction actually asks for. Intent
// equivalents pin one definition per requested verb; an implied intent, and a
// tag the instruction uses, prefer a definition; the rest are scored.
//
// Tags are how a domain declares its own intent words ("scrape", "collect")
// without Core learning them: a tag word scores like a label word, and a tag
// word few definitions share brings its best definition in ahead of the rest.
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

const BOOTSTRAP_INTENT_EQUIVALENTS = [
  ["fill", "type", "enter", "input"],
  ["select", "choose", "pick", "option"],
  ["click", "submit", "button", "press", "activate", "tap"],
  ["assert", "verify", "expect", "check", "wait", "exists", "appears", "extract", "text"],
  ["navigate", "open", "visit", "url"],
  ["clear", "empty", "erase"],
  ["scroll"],
  ["keypress", "keyboard", "key"],
  ["capture", "snapshot"]
] as const;

/**
 * Intents an instruction carries without naming them, as the intent group it
 * implies. Filling in a form sets whatever controls it has, and its values do
 * not say which are choice lists: "Fill in the form with Ada as the name and
 * the Team plan" sets a select element, yet no word of it scores the select
 * node, so a live Flow was built without one and could not set the plan.
 *
 * The implied group's best definition is preferred, never required, so a
 * domain without one, or a catalog without room for it, fails nothing.
 */
const BOOTSTRAP_IMPLIED_INTENTS: ReadonlyArray<{ word: string; implies: readonly string[] }> = [
  { word: "fill", implies: BOOTSTRAP_INTENT_EQUIVALENTS[1] }
];

/**
 * A tag word carried by more available definitions than this names a family,
 * such as every output of one domain, rather than an intent: it still scores,
 * but prefers nothing.
 */
const MAX_DEFINITIONS_PER_INTENT_TAG = 3;

/** At most this many definitions are preferred for their tags, so tags cannot crowd a bounded catalog. */
const MAX_TAG_PREFERENCES = 4;

const BOOTSTRAP_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "create", "do", "flow", "for", "form", "from",
  "in", "into", "it", "of", "on", "or", "page", "please", "the", "then", "to", "using", "with"
]);

export function rankBootstrapDefinitions(
  definitions: AutomationStudioNodeDefinition[],
  instructionText: string
): {
  required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }>;
  /**
   * Definitions an implied intent names, then those whose declared tag the
   * instruction used, best first; wanted, but never essential.
   */
  preferred: AutomationStudioNodeDefinition[];
  ranked: AutomationStudioNodeDefinition[];
} {
  const tokens = new Set(tokenizeBootstrapText(instructionText));
  if (!tokens.size) return { required: [], preferred: [], ranked: definitions };
  const searchable = new Map(definitions.map((definition) => [definition.id, bootstrapDefinitionSearchFields(definition)]));
  const required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }> = [];
  const requiredIds = new Set<string>();
  for (const equivalents of BOOTSTRAP_INTENT_EQUIVALENTS) {
    const requested = equivalents.find((term) => tokens.has(term));
    if (!requested) continue;
    const definition = bestBootstrapDefinition(definitions, searchable, equivalents);
    if (definition) requiredIds.add(definition.id);
    required.push({ term: requested, ...(definition ? { definition } : {}) });
  }
  for (const foundation of [["start", "begin", "entry"], ["end", "finish", "terminal", "complete"]] as const) {
    const definition = bestBootstrapDefinition(definitions, searchable, foundation);
    if (definition && !requiredIds.has(definition.id)) {
      requiredIds.add(definition.id);
      required.push({ term: foundation[0], definition });
    }
  }
  const implied: AutomationStudioNodeDefinition[] = [];
  for (const intent of BOOTSTRAP_IMPLIED_INTENTS) {
    if (!tokens.has(intent.word)) continue;
    const definition = bestBootstrapDefinition(definitions, searchable, intent.implies);
    if (definition && !requiredIds.has(definition.id) && !implied.includes(definition)) implied.push(definition);
  }
  const instructionTerms = [...tokens].filter((term) => !BOOTSTRAP_STOP_WORDS.has(term));
  const preferred = [
    ...implied,
    ...preferTaggedDefinitions(definitions, searchable, instructionTerms, new Set([...requiredIds, ...implied.map((definition) => definition.id)]))
  ];
  const chosenIds = new Set([...requiredIds, ...preferred.map((definition) => definition.id)]);
  const ranked = definitions
    .filter((definition) => !chosenIds.has(definition.id))
    .map((definition) => ({
      definition,
      score: scoreBootstrapDefinition(searchable.get(definition.id)!, instructionTerms)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))
    .map((candidate) => candidate.definition);
  return { required, preferred, ranked };
}

// The highest-scoring definition for any of the terms, ties broken by id, or
// none when no definition scores.
function bestBootstrapDefinition(
  definitions: AutomationStudioNodeDefinition[],
  searchable: ReadonlyMap<string, BootstrapSearchFields>,
  terms: readonly string[]
): AutomationStudioNodeDefinition | undefined {
  return definitions
    .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, terms) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))[0]?.definition;
}

// For each instruction word, in order, that is a tag word of at most
// MAX_DEFINITIONS_PER_INTENT_TAG definitions and none of them is chosen yet,
// the best-scoring carrier is preferred.
function preferTaggedDefinitions(
  definitions: AutomationStudioNodeDefinition[],
  searchable: ReadonlyMap<string, BootstrapSearchFields>,
  instructionTerms: readonly string[],
  alreadyChosenIds: ReadonlySet<string>
): AutomationStudioNodeDefinition[] {
  const carriers = new Map<string, AutomationStudioNodeDefinition[]>();
  for (const definition of definitions) for (const word of searchable.get(definition.id)!.tagWords) {
    carriers.set(word, [...(carriers.get(word) ?? []), definition]);
  }
  const chosen = new Set(alreadyChosenIds);
  const preferred: AutomationStudioNodeDefinition[] = [];
  for (const term of instructionTerms) {
    if (preferred.length >= MAX_TAG_PREFERENCES) break;
    const candidates = carriers.get(term);
    if (!candidates || candidates.length > MAX_DEFINITIONS_PER_INTENT_TAG || candidates.some((definition) => chosen.has(definition.id))) continue;
    const best = candidates
      .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, instructionTerms) }))
      .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))[0]!.definition;
    chosen.add(best.id);
    preferred.push(best);
  }
  return preferred;
}

function tokenizeBootstrapText(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/g).filter((term) => term.length >= 2 && term.length <= 64))];
}

type BootstrapSearchFields = {
  identity: string;
  label: string;
  description: string;
  /** Every word of the definition's declared tags, once each. */
  tagWords: string[];
  detail: string;
};

function bootstrapDefinitionSearchFields(definition: AutomationStudioNodeDefinition): BootstrapSearchFields {
  return {
    identity: [definition.id, definition.outputAction?.fixedOutputId, ...(definition.outputAction?.allowedOutputIds ?? [])].filter(Boolean).join(" ").toLowerCase(),
    label: definition.label.toLowerCase(),
    description: definition.description.toLowerCase(),
    tagWords: [...new Set((definition.tags ?? []).flatMap(tokenizeBootstrapText))],
    detail: [
      definition.category,
      ...Object.entries(definition.capabilities).filter(([, enabled]) => enabled).map(([key]) => key),
      ...definition.inputs.map((port) => port.id),
      ...definition.outputs.map((port) => port.id),
      ...definition.parameters.map((parameter) => parameter.id)
    ].join(" ").toLowerCase()
  };
}

function scoreBootstrapDefinition(
  fields: BootstrapSearchFields,
  terms: readonly string[]
): number {
  let score = 0;
  for (const term of terms) {
    if (containsBootstrapTerm(fields.identity, term)) score += 24;
    if (containsBootstrapTerm(fields.label, term)) score += 12;
    if (fields.tagWords.includes(term)) score += 12;
    if (containsBootstrapTerm(fields.description, term)) score += 5;
    if (containsBootstrapTerm(fields.detail, term)) score += 2;
  }
  return score;
}

function containsBootstrapTerm(value: string, term: string): boolean {
  return value.split(/[^a-z0-9]+/g).includes(term);
}
