// Matching what the model wrote against what the registry declares: which
// node a step means, which parameter a key means, and which port a branch
// means.
//
// Every match is exact on something the catalog entry actually showed -- an
// id, a label, an implementation key, a port role -- read through
// `authoringKey` so spelling and punctuation do not matter. The one inexact
// match, by shared words, is taken only when a single definition wins
// outright; a tie is a refusal with the candidates named, never a guess.
import type { AutomationNodeParameter, AutomationNodePort, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { authoringKey } from "./keys.ts";

/** How many near matches a refusal names. */
const MAX_CANDIDATES = 5;

/** Keys a model writes for a parameter that is declared under another name. */
const PARAMETER_SYNONYMS: ReadonlyMap<string, string[]> = new Map([
  ["link", ["url"]],
  ["address", ["url"]],
  ["page", ["url"]],
  ["value", ["text", "value"]],
  ["input", ["text"]],
  ["content", ["text"]],
  ["element", ["target", "element"]],
  ["control", ["target"]],
  ["field", ["target"]],
  ["on", ["target"]],
  ["columns", ["fields"]],
  ["dataset", ["recordOutput"]],
  ["records", ["recordOutput"]],
  ["save", ["recordOutput"]],
  ["timeout", ["timeoutMs"]],
  ["wait", ["timeoutMs", "wait"]]
]);

/** Words a model writes for a port that is declared under another name. */
const PORT_SYNONYMS: ReadonlyMap<string, { ids: string[]; role?: AutomationNodePort["role"] }> = new Map([
  ["failure", { ids: ["failed", "failure", "error"], role: "failure" }],
  ["failed", { ids: ["failed", "failure", "error"], role: "failure" }],
  ["error", { ids: ["failed", "failure", "error"], role: "failure" }],
  ["success", { ids: ["success", "ok", "done"], role: "success" }],
  ["ok", { ids: ["success", "ok", "done"], role: "success" }],
  ["done", { ids: ["success", "ok", "done"], role: "success" }],
  ["records", { ids: ["records", "rows"], role: "data" }],
  ["rows", { ids: ["records", "rows"], role: "data" }],
  ["data", { ids: ["records", "rows"], role: "data" }]
]);

/** The definition a step named, or the near matches a refusal should name. */
export function matchAuthoringDefinition(text: string, definitions: readonly AutomationStudioNodeDefinition[]): {
  definition?: AutomationStudioNodeDefinition;
  candidates: string[];
} {
  const written = authoringKey(text);
  if (!written) return { candidates: [] };
  const exact = definitions.find((definition) => exactNames(definition).includes(written));
  if (exact) return { definition: exact, candidates: [] };
  const scored = definitions
    .map((definition) => ({ definition, score: sharedWords(text, definition) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
  const best = scored[0];
  const runnerUp = scored[1];
  if (best && (!runnerUp || runnerUp.score < best.score)) return { definition: best.definition, candidates: [] };
  return { candidates: scored.slice(0, MAX_CANDIDATES).map((entry) => entry.definition.id) };
}

/** The parameter a written key means, or `undefined`. */
export function matchAuthoringParameter(key: string, definition: AutomationStudioNodeDefinition): AutomationNodeParameter | undefined {
  const written = authoringKey(key);
  const byId = definition.parameters.find((parameter) => authoringKey(parameter.id) === written);
  if (byId) return byId;
  const byLabel = definition.parameters.find((parameter) => authoringKey(parameter.label) === written);
  if (byLabel) return byLabel;
  for (const candidate of PARAMETER_SYNONYMS.get(written) ?? []) {
    const match = definition.parameters.find((parameter) => authoringKey(parameter.id) === authoringKey(candidate));
    if (match) return match;
  }
  return undefined;
}

/**
 * The structured parameter a written key belongs *inside*, when exactly one
 * declares it and nothing else claims the key.
 *
 * A model writes what it was told to write. The list-extraction tool's own
 * description says to name the list's columns under `fields`, so live builds
 * wrote `fields:` as a line of the step -- beside the parameter rather than
 * inside it -- and were refused `bootstrap.unknown_parameter`. `paginate` went
 * the same way. Where it goes is not a guess: the parameter's own `example`
 * declares the key, so the value is set at `<parameter>.<key>` exactly as a
 * dotted key would have.
 *
 * Deterministic or nothing. The key must be declared by exactly one structured
 * parameter of this node, and a parameter whose value is filled from a
 * contract rather than written -- a record output -- never claims one.
 */
export function matchAuthoringParameterContaining(key: string, definition: AutomationStudioNodeDefinition): AutomationNodeParameter | undefined {
  const written = authoringKey(key);
  if (!written) return undefined;
  const carriers = definition.parameters.filter((parameter) =>
    (parameter.valueType === "object" || parameter.valueType === "json")
    && parameter.ui?.control !== "record-output"
    && exampleKeys(parameter).includes(written));
  return carriers.length === 1 ? carriers[0] : undefined;
}

/** The top-level keys a parameter's declared example shows, in `authoringKey` form. */
function exampleKeys(parameter: AutomationNodeParameter): string[] {
  const example = parameter.example;
  if (typeof example !== "object" || example === null || Array.isArray(example)) return [];
  return Object.keys(example).map(authoringKey);
}

/** The port a written name means among a node's ports, or `undefined`. */
export function matchAuthoringPort(name: string, ports: readonly AutomationNodePort[]): AutomationNodePort | undefined {
  const written = authoringKey(name);
  const byId = ports.find((port) => authoringKey(port.id) === written);
  if (byId) return byId;
  const byLabel = ports.find((port) => authoringKey(port.label) === written);
  if (byLabel) return byLabel;
  const synonym = PORT_SYNONYMS.get(written);
  if (!synonym) return undefined;
  const byRole = synonym.role ? ports.find((port) => port.role === synonym.role) : undefined;
  return byRole ?? ports.find((port) => synonym.ids.some((id) => authoringKey(id) === authoringKey(port.id)));
}

function exactNames(definition: AutomationStudioNodeDefinition): string[] {
  return [
    authoringKey(definition.id),
    authoringKey(definition.id.split(".").at(-1) ?? ""),
    authoringKey(definition.label),
    authoringKey(implementationKeyOf(definition)),
    ...(definition.outputAction?.fixedOutputId ? [authoringKey(definition.outputAction.fixedOutputId)] : [])
  ].filter(Boolean);
}

function sharedWords(text: string, definition: AutomationStudioNodeDefinition): number {
  const written = new Set(text.toLowerCase().split(/[^a-z0-9]+/u).filter((word) => word.length > 2));
  if (!written.size) return 0;
  const declared = new Set(`${definition.id} ${definition.label} ${implementationKeyOf(definition)}`.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean));
  let score = 0;
  for (const word of written) if (declared.has(word)) score += 1;
  return score;
}

/** The key a source names its implementation by, where its kind has one. */
function implementationKeyOf(definition: AutomationStudioNodeDefinition): string {
  const source = definition.source;
  return "implementationKey" in source ? source.implementationKey : "";
}
