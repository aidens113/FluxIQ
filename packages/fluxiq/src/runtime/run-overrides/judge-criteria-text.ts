import { automationStudioRunOverrides } from "./read.ts";

/**
 * The extra criteria the current run's frame asks the judge to apply, as a short list to put after
 * the judge's question, or nothing when the frame has none (so the question is sent as it always was).
 * Appended only: a criterion adds to what a yes must meet and never replaces the question.
 */
export function automationStudioJudgeCriteriaText(): string | undefined {
  const criteria = (automationStudioRunOverrides()?.judgeCriteria ?? []).filter((each) => typeof each === "string" && each.trim() !== "");
  if (criteria.length === 0) return undefined;
  return ["The person who set this up also asks that a yes meet each of these criteria:", ...criteria.map((each) => `- ${each}`)].join("\n");
}
