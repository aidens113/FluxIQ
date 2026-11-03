// Naming a Flow the way a person does.
//
// Nobody types `flow.8c1f...`. They say "my kettle flow", and a model repeating
// them writes `"flowId": "kettle"`. Core holds the project's Flows, so turning
// that into the id is Core's job and never the model's: the model is asked for
// the fewest things that could work, and anything derivable is derived here.

import { automationStudioClosestName, automationStudioNameWords } from "./closest.ts";
import type { AutomationStudioConversationFlowReference } from "./decision.ts";

/** Below this, a written Flow name is not taken as naming any Flow in particular. */
const FLOW_MATCH_FLOOR = 0.5;

/** Words that say "a Flow" without saying which. */
const GENERIC_WORDS: ReadonlySet<string> = new Set(["flow", "flows", "automation", "run", "one", "new", "old", "test"]);

/**
 * The Flow a written value names: an exact id, or the closest name. Null when
 * nothing is close enough to be the one meant -- the caller then asks which,
 * rather than running whichever Flow happened to score highest.
 */
export function automationStudioConversationFlowNamed(
  value: string,
  flows: readonly AutomationStudioConversationFlowReference[]
): AutomationStudioConversationFlowReference | null {
  const exact = flows.find((flow) => flow.flowId === value);
  if (exact) return exact;
  const match = automationStudioClosestName(value, flows.map((flow) => ({ key: flow.flowId, labels: [flow.name] })));
  if (!match || match.confidence < FLOW_MATCH_FLOOR) return null;
  return flows.find((flow) => flow.flowId === match.key) ?? null;
}

/**
 * The one Flow a sentence mentions by a distinctive word of its name, or null
 * when it mentions none or two equally. Used when Core reads the words itself,
 * with no model to have named the Flow for it.
 */
export function automationStudioConversationFlowMentioned(
  message: string,
  flows: readonly AutomationStudioConversationFlowReference[]
): AutomationStudioConversationFlowReference | null {
  const said = new Set(automationStudioNameWords(message));
  let best: AutomationStudioConversationFlowReference | null = null;
  let bestCount = 0;
  let tied = false;
  for (const flow of flows) {
    const count = automationStudioNameWords(flow.name).filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word) && said.has(word)).length;
    if (count > bestCount) {
      best = flow;
      bestCount = count;
      tied = false;
    } else if (count > 0 && count === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** The words of every Flow name, so a caller reading the rest of a sentence can set them aside. */
export function automationStudioConversationFlowWords(flows: readonly AutomationStudioConversationFlowReference[]): Set<string> {
  return new Set(flows.flatMap((flow) => automationStudioNameWords(flow.name)).filter((word) => !GENERIC_WORDS.has(word)));
}
