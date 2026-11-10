// A caller's scope (fluxnode-plan N6) held over a saved Flow's own run (`../flow-run/`), which the
// engine drives without the attempt's call chain and so without `./scope-gate.ts`. The scope is the
// grant there too: what it does not grant is refused, nobody is asked, and the attempt looks for
// another way to the result within its budget. Nothing here ends a task.
//
// **Before the run, on the plan** (`refusal`): a step that declares a class of lasting act the scope
// does not grant, or names an address off its sites, keeps the whole Flow from running, so nothing is
// sent at all; the rounds are told why (`../attempt/round-note.ts`). What a step declares is what the
// domain declared for it as the steps were assembled, and the classes on its node.
//
// **While it runs, on each step's call** (`gated`): a step whose parameters, as the engine resolved
// them for this run, name an address off the sites is refused unsent, as a failed step that did
// nothing, and the run stops there like any failing step. That is what reaches an address the plan
// could not show: a step bound to a caller's input (`../flow-run/input-bound-steps.ts`) takes this
// run's value only now. A step's input row is not read: a row's own links are what was read, not
// where the step goes.
//
// Not covered: where the page ends up after a step that follows a link on its own. The model's calls
// are held to that (`./scope-gate.ts`, the page's location); an engine step reports no location.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioAnswerFirstCallerScope } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstScopeRule } from "./scope-rule.ts";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

const OUTSIDE_CODE = "answer_first.outside_scope";

/** One step of the plan as the scope reads it: the classes it declares, and what it is run with. */
export type AutomationStudioAnswerFirstReplayScopeStep = { consequences: readonly unknown[]; parameters?: JsonValue | undefined };

export type AutomationStudioAnswerFirstReplayScope = {
  /** Why the plan may not run, in Core's words, or nothing where it may. */
  refusal(steps: readonly AutomationStudioAnswerFirstReplayScopeStep[]): string | undefined;
  /** `options` with every step's call held to the sites. */
  gated(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions;
};

/** The scope over a saved Flow's run, or nothing where the caller gave none. */
export function automationStudioAnswerFirstReplayScope(scope: AutomationStudioAnswerFirstCallerScope | undefined): AutomationStudioAnswerFirstReplayScope | undefined {
  if (scope === undefined) return undefined;
  const rule = automationStudioAnswerFirstScopeRule(scope);
  const offSite = (value: JsonValue | undefined): string | undefined => (rule.bySite && value !== undefined ? rule.hostsIn(value).find((host) => !rule.allowed(host)) : undefined);
  return {
    refusal(steps) {
      const classes = [...new Set(steps.flatMap((step) => rule.notGranted(step.consequences)))];
      if (classes.length) return `A step of the saved Flow is an act this task may not do (${classes.join(", ")}), so the Flow did not run. Its steps are your draft: get the result without that act.`;
      const host = steps.map((step) => offSite(step.parameters)).find((found) => found !== undefined);
      if (host !== undefined) return `A step of the saved Flow goes to ${host}, outside the sites this task may use (${rule.listed}), so the Flow did not run. Its steps are your draft: get the result on those sites.`;
      return undefined;
    },
    gated(options) {
      if (!rule.bySite) return options;
      const gated: AutomationStudioGraphExecutionOptions = { ...options };
      const native = options.nativeNodeExecutor;
      if (native) gated.nativeNodeExecutor = (async (request) => {
        const host = offSite(request.node.parameterValues as JsonObject | undefined);
        return host === undefined ? await native(request) : { result: outside(host, rule.listed) };
      }) as Native;
      const dispatcher = options.effectDispatcher;
      if (dispatcher) gated.effectDispatcher = (async (effect, context) => {
        const payload = effect.payload;
        const parameters = typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload.parameters : undefined;
        const host = offSite(parameters);
        return host === undefined ? await dispatcher(effect, context) : outside(host, rule.listed);
      }) as Dispatcher;
      return gated;
    }
  };
}

/** Refused unsent: a failed step that certainly did nothing, and that the same call would fail again. */
function outside(host: string, listed: string): AutomationNodeExecutionResult {
  return {
    status: "failed", route: "failed", outputs: {}, effects: [],
    message: `This step was not done: ${host} is outside the sites this task may use (${listed}).`,
    failure: { category: "blocked_by_capability_or_policy", code: OUTSIDE_CODE, retryable: false, stage: "dispatch", effect: "unacted" }
  };
}
