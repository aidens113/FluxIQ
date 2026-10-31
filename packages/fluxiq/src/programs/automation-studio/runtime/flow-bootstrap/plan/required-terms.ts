// Which capabilities an instruction asks for that no offered node provides.
//
// The catalog shows the model every offered node (`./catalog.ts`), so nothing
// here chooses, orders or prefers a node: until 2026-09-30 this file ranked the
// library against the instruction and the catalog sent the best-ranked nodes
// that fit a byte budget (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE
// NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION OR USE ANY RANKING
// ALGORITHM"). What is left is a check. An instruction that says to enter,
// choose, press, verify, navigate, clear, scroll, press a key or capture asks
// for something only a node can do, and a library with no node that does it
// cannot build that Flow at all, so the build is refused before a provider is
// called (`missingRequiredTerms`). Start and end are named when the library has
// them, so a reader can see they were looked for.
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

/** Words that ask for one kind of action, each group answered by a node's declared operation identity. */
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

const FOUNDATIONS = [["start", "begin", "entry"], ["end", "finish", "terminal", "complete"]] as const;

/** Each capability the instruction asks for, in the order above, with whether an offered node provides it. */
export function automationStudioFlowBootstrapRequiredTerms(
  definitions: readonly AutomationStudioNodeDefinition[],
  instructionText: string
): Array<{ term: string; provided: boolean }> {
  const tokens = new Set(tokenizeBootstrapText(instructionText));
  if (!tokens.size) return [];
  const searchable = definitions.map(bootstrapOperationIdentityWords);
  const provided = (terms: readonly string[]): boolean => searchable.some((words) => terms.some((term) => words.has(term)));
  const required: Array<{ term: string; provided: boolean }> = [];
  for (const equivalents of BOOTSTRAP_INTENT_EQUIVALENTS) {
    const requested = equivalents.find((term) => tokens.has(term));
    if (requested) required.push({ term: requested, provided: provided(equivalents) });
  }
  for (const foundation of FOUNDATIONS) if (provided(foundation)) required.push({ term: foundation[0], provided: true });
  return required;
}

function tokenizeBootstrapText(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/g).filter((term) => term.length >= 2))];
}

/**
 * Only a node's operation names declare what it provides. Help can ask the
 * author to choose a parameter, and a data port can hold an option, without
 * the node providing an operation that chooses anything. That help and shape
 * still reach the model through the whole catalog; neither grants capability.
 */
function bootstrapOperationIdentityWords(definition: AutomationStudioNodeDefinition): ReadonlySet<string> {
  return new Set([
    definition.id,
    definition.outputAction?.fixedOutputId ?? "",
    ...(definition.outputAction?.allowedOutputIds ?? []),
    definition.label,
    ...(definition.tags ?? [])
  ].flatMap((text) => text.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)));
}
