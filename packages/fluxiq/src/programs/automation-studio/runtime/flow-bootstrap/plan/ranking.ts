// Ranking node definitions against an instruction so the catalog handed to a
// provider leads with what the instruction actually asks for. Intent
// equivalents pin one definition per requested verb; the rest are scored.
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

const BOOTSTRAP_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "create", "do", "flow", "for", "form", "from",
  "in", "into", "it", "of", "on", "or", "page", "please", "the", "then", "to", "using", "with"
]);

export function rankBootstrapDefinitions(
  definitions: AutomationStudioNodeDefinition[],
  instructionText: string
): {
  required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }>;
  ranked: AutomationStudioNodeDefinition[];
} {
  const tokens = new Set(tokenizeBootstrapText(instructionText));
  if (!tokens.size) return { required: [], ranked: definitions };
  const searchable = new Map(definitions.map((definition) => [definition.id, bootstrapDefinitionSearchFields(definition)]));
  const required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }> = [];
  const requiredIds = new Set<string>();
  for (const equivalents of BOOTSTRAP_INTENT_EQUIVALENTS) {
    const requested = equivalents.find((term) => tokens.has(term));
    if (!requested) continue;
    const candidates = definitions
      .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, equivalents) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
    const definition = candidates[0]?.definition;
    if (definition) requiredIds.add(definition.id);
    required.push({ term: requested, ...(definition ? { definition } : {}) });
  }
  for (const foundation of [["start", "begin", "entry"], ["end", "finish", "terminal", "complete"]] as const) {
    const candidates = definitions
      .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, foundation) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
    const definition = candidates[0]?.definition;
    if (definition && !requiredIds.has(definition.id)) {
      requiredIds.add(definition.id);
      required.push({ term: foundation[0], definition });
    }
  }
  const instructionTerms = [...tokens].filter((term) => !BOOTSTRAP_STOP_WORDS.has(term));
  const ranked = definitions
    .filter((definition) => !requiredIds.has(definition.id))
    .map((definition) => ({
      definition,
      score: scoreBootstrapDefinition(searchable.get(definition.id)!, instructionTerms)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))
    .map((candidate) => candidate.definition);
  return { required, ranked };
}

function tokenizeBootstrapText(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/g).filter((term) => term.length >= 2 && term.length <= 64))];
}

function bootstrapDefinitionSearchFields(definition: AutomationStudioNodeDefinition): {
  identity: string;
  label: string;
  description: string;
  detail: string;
} {
  return {
    identity: [definition.id, definition.outputAction?.fixedOutputId, ...(definition.outputAction?.allowedOutputIds ?? [])].filter(Boolean).join(" ").toLowerCase(),
    label: definition.label.toLowerCase(),
    description: definition.description.toLowerCase(),
    detail: [
      definition.category,
      ...(definition.tags ?? []),
      ...Object.entries(definition.capabilities).filter(([, enabled]) => enabled).map(([key]) => key),
      ...definition.inputs.map((port) => port.id),
      ...definition.outputs.map((port) => port.id),
      ...definition.parameters.map((parameter) => parameter.id)
    ].join(" ").toLowerCase()
  };
}

function scoreBootstrapDefinition(
  fields: ReturnType<typeof bootstrapDefinitionSearchFields>,
  terms: readonly string[]
): number {
  let score = 0;
  for (const term of terms) {
    if (containsBootstrapTerm(fields.identity, term)) score += 24;
    if (containsBootstrapTerm(fields.label, term)) score += 12;
    if (containsBootstrapTerm(fields.description, term)) score += 5;
    if (containsBootstrapTerm(fields.detail, term)) score += 2;
  }
  return score;
}

function containsBootstrapTerm(value: string, term: string): boolean {
  return value.split(/[^a-z0-9]+/g).includes(term);
}
