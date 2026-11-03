// Which plan step a `from` names (t811): an exact key wins; otherwise a script
// label that names exactly one step is that step's key. A label naming none, or
// two or more, resolves to nothing, and the caller answers with the keys and
// their labels. A proposal from a JSON plan has no labels, so `from` is a key
// there, as it always was.
import type { AutomationStudioSubflowProposal } from "../subflow-candidate/index.ts";

/** `from` as a step key of the latest proposal (and the label it was given by, where it was one), or the keys an ambiguous label names, or undefined where it names no step. */
export function automationStudioSubflowFromStepResolve(from: string, keys: readonly string[], labels: AutomationStudioSubflowProposal["stepLabels"]): { key: string; label?: string } | { ambiguous: string[] } | undefined {
  if (keys.includes(from)) return { key: from };
  if (!labels) return undefined;
  const wanted = from.trim().toLowerCase();
  const label = Object.hasOwn(labels, from) ? from : Object.keys(labels).find((candidate) => candidate.toLowerCase() === wanted);
  if (label === undefined) return undefined;
  const named = [...new Set((labels[label] ?? []).filter((key) => keys.includes(key)))];
  if (named.length === 1) return { key: named[0]!, label };
  return named.length ? { ambiguous: named } : undefined;
}
