import type { DraftPredecessorFacts } from "../../../../../runtime/flow-authoring/draft/presentation/index.ts";

export function automationStudioFlowDraftMissingPredecessorsInstruction(input: DraftPredecessorFacts): string {
  const way = input.steps;
  const one = way.length === 1;
  const named = one ? `Step ${way[0]}` : `Steps ${way.slice(0, -1).join(", ")} and ${way[way.length - 1]}`;
  return `${named} changed the page on the way to step ${input.targetStep} when you ran ${one ? "it" : "them"}, and ${one ? "is" : "are"} not in the Flow, so the test never reached the page step ${input.targetStep} acted on: add ${one ? "it" : "them"} (amend_draft add).`;
}
