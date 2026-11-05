// Reading the page before a part runs: one zero-wait batch of facts, the same read a
// lifecycle boundary makes (`engine/automation/lifecycle-run/fact-observation.ts`).
//
// The page's site is asked as facts too, one per site the part names, so the read is
// one command with no wait in it and a site is either answered exactly or not known:
// an address the page answers `false` for every site is another site, and an answer of
// `unknown` for any is no answer at all. Nothing reads the page's address itself.
import type { JsonValue } from "../../../../../core/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../../../components/automation/index.ts";
import { observeAutomationStudioFacts } from "../../../../../engine/automation/lifecycle-run/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../runtime/automation-host/index.ts";
import type { AutomationStudioFactCondition } from "../../../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioPartPageRead } from "../../../../../runtime/project-parts/index.ts";

/** The pattern that holds for exactly the addresses of one origin. */
export function projectPartOriginPattern(origin: string): string {
  return `^${origin.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&")}(?:[/?#]|$)`;
}

const siteFact = (origin: string): AutomationStudioFactCondition => ({ fact: "url", op: "matches", value: projectPartOriginPattern(origin) });

/**
 * A condition with the run's values read into its target. One holding a value the run does
 * not have asks a fact no host answers, so it reads `unknown` and the part does not start.
 */
function withValues(condition: AutomationStudioFactCondition, inputs: Readonly<Record<string, JsonValue>>): AutomationStudioFactCondition {
  if (!condition.target) return condition;
  const resolved = resolveAutomationNodeParameterValues({ target: condition.target }, { ...inputs });
  const target = resolved.values.target;
  if (resolved.missingPaths.length || !target || typeof target !== "object" || Array.isArray(target)) return { fact: "unresolved", op: "exists" };
  return { ...condition, target };
}

export async function readProjectPartPage(input: {
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  sites: readonly string[];
  conditions: readonly AutomationStudioFactCondition[];
  inputs: Readonly<Record<string, JsonValue>>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioPartPageRead> {
  const observed = await observeAutomationStudioFacts({
    hostRuntime: input.hostRuntime,
    groups: [{ key: "sites", conditions: input.sites.map(siteFact) }, { key: "start", conditions: input.conditions.map((condition) => withValues(condition, input.inputs)) }],
    context: { inputs: input.inputs, ...(input.signal ? { signal: input.signal } : {}) }
  });
  const sites = observed.results.get("sites") ?? [];
  const at = sites.findIndex((result) => result.truth === "true");
  const allAnswered = sites.length > 0 && sites.every((result) => result.truth !== "unknown");
  return {
    // A site that holds is that site. Every site answered false is a page elsewhere, said as no site of the part's.
    origin: at >= 0 ? input.sites[at] : allAnswered ? "elsewhere:" : undefined,
    startFacts: (observed.results.get("start") ?? []).map((result) => result.truth)
  };
}
