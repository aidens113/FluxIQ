// The page facts a plan states, and the handles their targets name (t392).
//
// A script's `when:` and `done when:` lines become fact conditions (contract
// C9, `../../flow-bootstrap/script-statements/fact-condition.ts`), and a fact
// about a control names it as a step's target is named: by the handle the
// evidence printed, `{ "handle": "t5" }`. They sit in five places:
//
//   a handler's `when` and `completionCheck`      node parameters
//   an entry's `when` (`fluxiq.entry`)            node metadata
//   a checkpoint's `when` (`fluxiq.checkpoint`)   node metadata
//   a Subflow's success check                     Subflow metadata, `fluxiq.successCheck`
//
// A handle means nothing to a run, so each is resolved at bootstrap completion
// through the same domain resolution a step's target is
// (`./plan-parameter-resolution.ts`), and a saved graph never carries one.
// This module only finds them; a dialog target, `{ kind: "dialog", role, name }`,
// names no handle and is not one of them.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { automationStudioPlanNodeParametersNameHandle } from "./plan-node-handles.ts";

/**
 * The definition a fact's target is presented to the domain under. A fact is
 * no step, and runs no node, so the domain is asked about it as a step of this
 * id whose only parameter is `target`: the handle, exactly as a step's
 * `target:` holds it. What the domain answers -- the parameters such a step
 * would run with -- becomes the fact's target, the durable target in the
 * host's own form that the host evaluates the fact against (C9).
 */
export const AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID = "fluxiq.fact.target";

/** A fact condition whose target names a handle, and where it sits in the plan. */
export type AutomationStudioPlanFactTargetSite = {
  /** The issue path of the target, from `plan`. */
  path: string;
  /** `<subflow key>.<node key>` of the node it is on, or `<subflow key>` for a success check. */
  ref: string;
  /** The target as written. */
  target: JsonValue;
  /** Puts a resolved target in its place, in the plan the site was read from. */
  replace(target: JsonObject): void;
};

/** The handler parameters that hold fact lists. */
const HANDLER_FACT_LISTS = ["when", "completionCheck"] as const;

/**
 * Every fact condition in the plan whose target names a handle, well-formed or
 * not. `replace` writes into the plan passed in, so a caller that resolves
 * hands this its own copy.
 */
export function automationStudioPlanFactTargetSites(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioPlanFactTargetSite[] {
  const sites: AutomationStudioPlanFactTargetSite[] = [];
  const collect = (list: unknown, path: string, ref: string): void => {
    if (!Array.isArray(list)) return;
    list.forEach((condition: unknown, index) => {
      if (!isObject(condition)) return;
      const target = condition.target as JsonValue | undefined;
      if (target === undefined || !automationStudioPlanNodeParametersNameHandle(target)) return;
      sites.push({ path: `${path}.${index}.target`, ref, target, replace: (resolved) => { list[index] = { ...condition, target: resolved }; } });
    });
  };
  plan.subflows.forEach((subflow, subflowIndex) => {
    const at = `plan.subflows.${subflowIndex}`;
    collect(subflow.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck], `${at}.metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck}`, subflow.key);
    subflow.nodes.forEach((node, nodeIndex) => {
      const nodeAt = `${at}.nodes.${nodeIndex}`;
      const ref = `${subflow.key}.${node.key}`;
      if (node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) {
        for (const list of HANDLER_FACT_LISTS) collect(node.parameters?.[list], `${nodeAt}.parameters.${list}`, ref);
      }
      for (const key of [AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry, AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint] as const) {
        collect(node.metadata?.[key]?.when, `${nodeAt}.metadata.${key}.when`, ref);
      }
    });
  });
  return sites;
}

/**
 * The paths of every fact target still naming a handle in node or Subflow
 * metadata. A handler's facts are node parameters, which the node's own check
 * already covers.
 */
export function automationStudioPlanMetadataFactHandlePaths(plan: AutomationStudioFlowBootstrapPlan): string[] {
  return automationStudioPlanFactTargetSites(plan).filter((site) => !site.path.includes(".parameters.")).map((site) => site.path);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
