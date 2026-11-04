// Which saved parts the opening look offers (the subflow library, "Detection", first rung).
// Pure: the library's reader hands over its candidates and this orders and screens them.
//
// **Order.** Parts on the origin the build starts on come first, then the rest; inside each, a
// part the person's words matched comes before one they did not, best match first. Up to five.
//
// **Never offered.** A part with a lasting act that has not been proven (a card's trust:
// unproven, with lasting classes), and a part whose lasting classes are not all within what
// was asked: both would make a lasting act the person did not ask for one offer away.
import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_KNOWN_PARTS_NOTE } from "./words.ts";
import type { AutomationStudioKnownPart, AutomationStudioKnownPartCandidate, AutomationStudioKnownParts } from "./types.ts";

export const AUTOMATION_STUDIO_KNOWN_PARTS_LIMIT = 5;

/** Whether this card may be offered at all, whatever the person's words matched. */
export function automationStudioPartOfferable(card: AutomationStudioSubflowCard, askedClasses: readonly string[]): boolean {
  if (card.lastingClasses.length === 0) return true;
  if (card.trust.tier === "unproven") return false;
  return card.lastingClasses.every((lasting) => askedClasses.includes(lasting));
}

/** The shortlist, or undefined when nothing can be offered: a project with no such part sees nothing added. */
export function automationStudioKnownPartsOf(input: {
  candidates: readonly AutomationStudioKnownPartCandidate[];
  /** The origin of where the build starts, when it was told. */
  startOrigin?: string | undefined;
  /** The lasting classes the person's request allows. */
  askedClasses: readonly string[];
  limit?: number | undefined;
}): AutomationStudioKnownParts | undefined {
  const seen = new Set<string>();
  const offered = input.candidates
    .map((candidate, order) => ({ ...candidate, order }))
    .filter(({ card }) => {
      if (seen.has(card.partId)) return false;
      seen.add(card.partId);
      return automationStudioPartOfferable(card, input.askedClasses);
    });
  const onStart = (card: AutomationStudioSubflowCard) => (input.startOrigin !== undefined && card.sites.includes(input.startOrigin) ? 0 : 1);
  offered.sort((left, right) => onStart(left.card) - onStart(right.card) || (left.textRank ?? Infinity) - (right.textRank ?? Infinity) || left.order - right.order);
  const parts = offered.slice(0, Math.max(0, input.limit ?? AUTOMATION_STUDIO_KNOWN_PARTS_LIMIT)).map(({ card }) => knownPartOf(card));
  return parts.length ? { note: AUTOMATION_STUDIO_KNOWN_PARTS_NOTE, parts } : undefined;
}

function knownPartOf(card: AutomationStudioSubflowCard): AutomationStudioKnownPart {
  return {
    partId: card.partId,
    version: card.version,
    name: card.name,
    purpose: card.purpose,
    sites: [...card.sites],
    inputs: card.inputs.map((port) => ({ ...port })),
    outputs: card.outputs.map((port) => ({ ...port })),
    fixedValues: [...card.fixedValues],
    lastingClasses: [...card.lastingClasses],
    trust: card.trust.tier
  };
}
