// Turning a generated plan's parameters into the ones its nodes run with,
// before the plan is validated.
//
// Flow Bootstrap calls this between parsing the model's plan and validating it
// against the registry, so validation -- and everything after it -- sees real
// parameters or nothing. It asks the bound domain about every node, one at a
// time, and trusts none of the answer: it must be one of the three the binding
// declares, resolved parameters must be plain bounded JSON, and whatever the
// node ends up with must name no handle. Anything else refuses the node.
//
// A refusal is an issue on the node, never a quiet fallback. A node that names
// a handle is refused when no resolver is bound, and when the generation made
// no exploration -- no handle can have been issued to the model then, so none
// is worth asking about.
//
// `assertAutomationStudioFlowBootstrapPlanHandlesResolved` is the same promise
// for a plan that did not come through generation -- one handed to
// `createFlowBootstrapAdaptation` directly, or read back to be applied.
//
// This is also where a step meets the permission gate. Core hands the domain a
// check with every node and, with it, what the step declared its own action
// would lastingly do (`./plan-step-consequences.ts`). The domain adds what only
// it knows -- which control, and the verb -- and calls the check. A step the
// run is not permitted comes back `needs_permission`: an issue of its own, not
// one of the model's mistakes, because no rewrite of the plan can answer it.
// Only a person can, and the gate has already raised the request that asks.
//
// The one node it does not ask about is a step the Flow being extended already
// runs, carried over untouched and declaring nothing (`./inherited-plan-nodes.ts`):
// it names no handle and adds nothing to what the Flow does, so it stands.
//
// **A candidate submission asks for the view history (t358).** A candidate is a
// whole Flow written after exploration, and its first steps act on pages
// exploration has since left: lane A round 4 (`run-muyrpbnk-fef374e7`) had
// twelve submissions refused for the start page's popup controls, which the
// page as exploration last saw it no longer showed. So a caller may say
// `handleReach: "view_history"`, which is handed to the domain with every node,
// and the domain then resolves a handle from any view exploration took. Only
// such an answer may carry `handleViews` -- which view each handle came from --
// and the resolution returns them per node as a record of where the
// candidate's targets were learned. Without it nothing is sent and nothing
// beside `status` and `parameters` is accepted, exactly as before.
//
// **A repair's steps are resolved here too (t429).** The steps an in-run
// repair writes -- a handler's body, a unit's replacement, steps inserted
// before a node -- name controls by handle as a build's do, and are saved to
// the Flow after the judged run, so they are put to the domain the same way
// (`../../recovery/annotation/step-evidence-resolution.ts`). Their handles were
// issued in the packets the repair's model was shown, not in a build's views,
// so the caller names that one packet (`handleEvidence`) and the domain
// resolves from it alone.
//
// **A page fact's target is resolved here too (t392).** A handler's `when`, an
// entry's, a checkpoint's and a success check name a control by handle, as a
// step's target does (`./plan-fact-targets.ts`). Each is put to the domain
// first, as a step of `AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID` whose
// only parameter is that `target`, declaring it does nothing lasting, and is
// held to everything a step is: a refusal, an `unchanged` answer, or an answer
// still naming a handle refuses it at its own path. What the domain answers
// becomes the fact's target. A handler with a refused fact is not asked about
// again; the fact's refusal already says why.
//
// **What the model wrote names elements by handle only (t432; user,
// 2026-10-10).** A caller whose plan is the model's own writing -- a candidate
// script, a reply's plan, a repair's steps -- says so (`writtenByModel`), and
// it is handed to the domain with every node, which then refuses an element the
// model named any other way rather than running it as written. A fact is
// Core's own statement, so Core refuses one itself: a fact target that names
// neither a handle nor a dialog -- an `at "<locator>"`, which only a
// hand-authored Flow may write -- is refused at its path with a sentence that
// says to name the element by its handle. A plan the host wrote (a draft, a
// step the Flow already holds) carries the domain's own resolved parameters and
// is never flagged.
//
// **A step the build acted on carries what its act made true (t447).** A step
// a build created used to carry no route signatures at all: the candidate path
// strips any the model wrote (`./bootstrap-completion.ts`) and has no build
// routing to sign one from (`../../flow-bootstrap/candidate/submission.ts`), so
// a run that met a page where the site already held the step's effect -- a
// coupon already "Collected" in the same session -- could never pass it over as
// done (`../../executor/state-routing/decision.ts`, `effect_holds`) and failed
// it instead. Only the domain knows which act a handle's control came from, so
// a resolved answer may carry that act's `effect`, in the host's own
// route-effect form, and within a signature's bound
// (`automationStudioReadRouteSignature`). It is written onto the plan node as
// `routeSignatures.effect`, on the candidate and the draft path alike, where
// the build signed no effect of its own: one signed from the step's own pages
// stands. `../../flow-bootstrap/adaptation.ts` carries it to the Flow node's
// metadata. A fact's answer is never one a run passes over, so an effect on it
// is not kept. An effect only ever skips: state routing goes on along the
// step's own success edge when the page shows it, and never runs a completed
// lasting act again because of one (`../../executor/state-routing/repeated-act.ts`).
//
// **A candidate's handle comes from the page its step runs on (t486).** Lane B
// (`run-mv636xvb-e1426db1`) submitted a step that named a control printed only
// on another page than the one the steps around it act on, and it was taken:
// it ran only because both pages shared one layout. With the view history,
// each handle says which page printed it, so a step is refused
// (`bootstrap.handle.other_page`), naming both pages, when the page it runs on
// is plain from the script and is not that page. It is plain only in one
// shape: the step has one way in and one way out, both plain success edges,
// from a step that leaves by no other edge and to a step reached by no other;
// both of those steps' handles were printed on one page; the step's own were
// all printed elsewhere (a location without its query or fragment, so a choice
// that only rewrites the query, as picking an option may, leaves the same
// page); and the step's views are newer than every view of
// both neighbours, so the build saw its page only after it had learned theirs.
// The last test is what keeps a real round trip -- a step that goes back to
// the page it came from, learned in that order -- from being refused. Anything
// else (a branch, a join, a first or last step, a neighbour with no handle, a
// neighbour that may move the page and stay) leaves the page undecided, and
// nothing is refused.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied, type AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
// From the module that owns them: `../harness.ts` and the harness barrel both lead back into this module's import cycle, and through them the two read as undefined when this module loads inside it.
import { AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH, AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN } from "../harness/structured-response.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioPlanHandleReach, AutomationStudioPlanHandleView } from "./binding.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID, automationStudioPlanFactTargetSites, automationStudioPlanFactTargetsNotNamingHandles, automationStudioPlanMetadataFactHandlePaths } from "./plan-fact-targets.ts";
import { automationStudioPlanNodeHandleSites, automationStudioPlanNodeParametersNameHandle } from "./plan-node-handles.ts";
import { automationStudioPlanStepConsequences } from "./plan-step-consequences.ts";
// The leaf directory, not the route-state barrel: it imports nothing of the runtime but types.
import { automationStudioReadRouteSignature } from "../../route-state/signatures/index.ts";

type ParameterResolver = Pick<AutomationStudioLlmEvidenceRuntimeBinding, "resolvePlanNodeParameters">;

/** Core's own reasons a node's parameters were not accepted. A domain's refusal carries the domain's codes instead. */
export const AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES = Object.freeze({
  malformed: "bootstrap.handle_malformed",
  notIssued: "bootstrap.handle_not_issued",
  unsupported: "bootstrap.handle_resolution_unavailable",
  failed: "bootstrap.parameter_resolution_failed",
  invalid: "bootstrap.parameter_resolution_invalid",
  refused: "bootstrap.parameters_refused",
  unresolved: "bootstrap.handle_unresolved",
  /** The step declared consequences Core could not read as its own classes. */
  consequences: "bootstrap.step_consequences_invalid",
  /** The step would do something lasting that neither the instruction nor the person's permission allows. */
  permission: "bootstrap.step_permission_required",
  /** A fact the model wrote names its element by something other than a handle (header, t432). */
  notAHandle: "bootstrap.target_not_a_handle",
  /** A step's handle was printed on another page than the one the steps around it act on (header, t486). */
  otherPage: "bootstrap.handle.other_page"
} as const);

/** What the model is told about a fact naming its element by anything but a handle: Core's own words, quoting nothing (header). */
const NOT_A_HANDLE_MESSAGE = "This fact names its element by something other than a handle. Name the element only by the handle the evidence printed for it, copied exactly, as a step does: `exists t5`, `text t7 contains \"Ready\"`.";

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;
const MAX_REFUSAL_CODES = 16;
const MAX_RESOLVED_PARAMETER_BYTES = 16_384;
/** Bounds on a node's `handleViews` (header): as many as a node may name handles, each location as long as a handle reference's. */
const MAX_HANDLE_VIEWS = 64;
const MAX_VIEW_LOCATION_LENGTH = 2_048;
const handleToken = (): RegExp => new RegExp(AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, "u");

/** The view one handle of a plan node came from (header), with the node named `<subflow key>.<node key>`. */
export type AutomationStudioFlowBootstrapPlanHandleView = AutomationStudioPlanHandleView & { node: string };

export type AutomationStudioFlowBootstrapPlanParameterResolution =
  /** `handleViews` only when the caller asked for the view history, in plan order. */
  | { ok: true; plan: AutomationStudioFlowBootstrapPlan; resolvedNodeKeys: string[]; handleViews?: AutomationStudioFlowBootstrapPlanHandleView[] }
  | { ok: false; issues: AutomationStudioFlowBootstrapIssue[] };

/**
 * Resolve every node's parameters through the bound domain.
 *
 * Returns a new plan; the one passed in is not changed.
 */
export async function resolveAutomationStudioFlowBootstrapPlanParameters(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  projectId: string;
  flowId: string;
  binding?: ParameterResolver | undefined;
  /** Whether this generation explored, so the model can have been shown handles at all. */
  handlesIssued: boolean;
  /**
   * The build's permission check for one step, named by its definition and
   * `<subflow key>.<node key>`. Absent, every step is handed
   * `automationStudioActionPermissionDenied`: a plan resolved with no build
   * behind it has nobody to ask, so no step with a lasting consequence passes.
   */
  permissionFor?: ((step: { definitionId: string; ref: string }) => AutomationStudioActionPermissionCheck) | undefined;
  /**
   * The nodes, by `<subflow key>.<node key>`, that the Flow being extended
   * already contains and the build left exactly as they were
   * (`./inherited-plan-nodes.ts`). One that declared nothing and names no
   * handle stands as the Flow holds it: it is not a step this build adds, so
   * there is nothing new to put to the gate.
   */
  inheritedNodeRefs?: ReadonlySet<string> | undefined;
  /** `view_history` for a candidate submission alone (header); absent, the domain resolves against the page as exploration last saw it. */
  handleReach?: AutomationStudioPlanHandleReach | undefined;
  /**
   * The one packet every handle of this plan was issued in, for the steps a
   * repair wrote (header, t429). Handed to the domain with every node and
   * every fact; absent for a build, whose handles resolve as they always have.
   */
  handleEvidence?: JsonObject | undefined;
  /** The plan is the model's own writing, so every element in it is named by handle or refused (header, t432). */
  writtenByModel?: boolean | undefined;
  /**
   * For a plan the host wrote, the parameters of each node, by
   * `<subflow key>.<node key>`, that the model wrote over it: an amendment's
   * settings on a draft step (`./amended-plan-parameters.ts`, t432). Handed to
   * the domain with that node alone, and a locator fact in one of them is
   * refused as one in a plan the model wrote is.
   */
  modelWrittenParameters?: ReadonlyMap<string, readonly string[]> | undefined;
}): Promise<AutomationStudioFlowBootstrapPlanParameterResolution> {
  const plan = structuredClone(input.plan);
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const site of automationStudioPlanFactTargetsNotNamingHandles(plan)) {
    if (!input.writtenByModel && !modelWroteFact(input.modelWrittenParameters?.get(site.ref), site.path)) continue;
    issues.push({ severity: "error", code: AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notAHandle, message: NOT_A_HANDLE_MESSAGE, path: site.path });
  }
  const resolvedNodeKeys: string[] = [];
  const handleViews: AutomationStudioFlowBootstrapPlanHandleView[] = [];
  // Page facts first (header): a handler's facts are its parameters, so they are resolved before the handler is asked about.
  const refusedHandlers = new Set<string>();
  for (const site of automationStudioPlanFactTargetSites(plan)) {
    const fact = { key: site.ref, definitionId: AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID, definitionVersion: "1.0.0", parameters: { target: site.target }, consequences: [] };
    const outcome = await resolveNode(fact, input, automationStudioActionPermissionDenied, false);
    if (outcome.status === "needs_permission") {
      issues.push(permissionIssue(outcome, site.path));
      return { ok: false, issues };
    }
    if (outcome.status !== "resolved") {
      // An `unchanged` answer leaves the handle in place, which `resolveNode` already refuses; this is the same refusal if it ever did not.
      for (const code of outcome.status === "refused" ? outcome.issueCodes : [AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved]) issues.push(parameterIssue(code, site.path));
      if (site.path.includes(".parameters.")) refusedHandlers.add(site.ref);
      continue;
    }
    site.replace(outcome.parameters);
    for (const view of outcome.handleViews ?? []) handleViews.push({ node: site.ref, handle: view.handle, view: view.view, location: view.location });
  }
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const ref = `${subflow.key}.${node.key}`;
      if (refusedHandlers.has(ref)) continue;
      const permission = input.permissionFor?.({ definitionId: node.definitionId, ref }) ?? automationStudioActionPermissionDenied;
      const outcome = await resolveNode(node, input, permission, input.inheritedNodeRefs?.has(ref) === true, input.modelWrittenParameters?.get(ref));
      const path = `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters`;
      if (outcome.status === "needs_permission") {
        // Not the model's mistake and not the model's to correct: the gate has
        // raised the request, and the person answers it. Nothing after it is
        // asked about, because the gate keeps only the first request and every
        // later step would be answered with an id that asks for another step's
        // classes -- a record that reads as though one request covered them all.
        issues.push(permissionIssue(outcome, path));
        return { ok: false, issues };
      }
      if (outcome.status === "refused") {
        for (const code of outcome.issueCodes) issues.push(parameterIssue(code, path));
        continue;
      }
      if (outcome.status === "unchanged") continue;
      node.parameters = outcome.parameters;
      // What the act on its control made true, where the build signed no effect of its own (header, t447).
      if (outcome.effect && !node.routeSignatures?.effect) node.routeSignatures = { ...node.routeSignatures, effect: outcome.effect };
      resolvedNodeKeys.push(node.key);
      for (const view of outcome.handleViews ?? []) handleViews.push({ node: ref, handle: view.handle, view: view.view, location: view.location });
    }
  }
  if (input.handleReach !== undefined) issues.push(...otherPageIssues(plan, handleViews));
  if (issues.length) return { ok: false, issues };
  return input.handleReach === undefined ? { ok: true, plan, resolvedNodeKeys } : { ok: true, plan, resolvedNodeKeys, handleViews };
}

/**
 * The steps whose handles were printed on another page than the one they run
 * on, where that page is plain from the script (header, t486): one issue per
 * step, on its parameters, naming the location that printed the step's
 * handles and the one it runs at. Core's own words call a page a location.
 */
function otherPageIssues(plan: AutomationStudioFlowBootstrapPlan, handleViews: readonly AutomationStudioFlowBootstrapPlanHandleView[]): AutomationStudioFlowBootstrapIssue[] {
  const viewsOf = new Map<string, AutomationStudioFlowBootstrapPlanHandleView[]>();
  for (const view of handleViews) viewsOf.set(view.node, [...(viewsOf.get(view.node) ?? []), view]);
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const own = viewsOf.get(`${subflow.key}.${node.key}`);
      if (!own?.length) continue;
      const before = onlyNeighbour(subflow.edges, node.key, "in");
      const after = onlyNeighbour(subflow.edges, node.key, "out");
      if (!before || !after) continue;
      const previous = viewsOf.get(`${subflow.key}.${before}`) ?? [];
      const next = viewsOf.get(`${subflow.key}.${after}`) ?? [];
      const shared = previous.length && next.length ? oneLocation([...previous, ...next]) : undefined;
      if (shared === undefined || own.some((view) => locationRoot(view.location) === shared)) continue;
      const newest = Math.max(...[...previous, ...next].map((view) => view.view));
      if (own.some((view) => view.view <= newest)) continue;
      const handles = [...new Set(own.map((view) => view.handle))];
      const printedAt = [...new Set(own.map((view) => view.location))];
      const runsAt = previous[0]!.location;
      issues.push({
        severity: "error",
        code: AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.otherPage,
        path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters`,
        message: `${handles.length === 1 ? "The handle" : "The handles"} ${handles.join(", ")} of this step ${handles.length === 1 ? "was" : "were"} printed in a view of ${printedAt.join(" and ")}, but the step runs at ${runsAt}, where the step before it and the step after it act. `
          + `Take the handle from a view of the location this step runs at (${runsAt}): look there and copy the handle its view prints for the control. If the control is not there, the step belongs where the Flow is at ${printedAt[0]}, or is not needed.`
      });
    }
  }
  return issues;
}

/**
 * The one node `key` is joined to on `side`, when that is plain: exactly one
 * edge on that side, a `success` edge, and the node at its other end joined by
 * no other edge on the facing side. Otherwise nothing.
 */
function onlyNeighbour(edges: readonly AutomationStudioFlowBootstrapPlan["subflows"][number]["edges"][number][], key: string, side: "in" | "out"): string | undefined {
  const near = (edge: (typeof edges)[number]) => (side === "in" ? edge.target.nodeKey : edge.source.nodeKey);
  const far = (edge: (typeof edges)[number]) => (side === "in" ? edge.source.nodeKey : edge.target.nodeKey);
  const mine = edges.filter((edge) => near(edge) === key);
  if (mine.length !== 1 || mine[0]!.source.portId !== "success") return undefined;
  const other = far(mine[0]!);
  return edges.filter((edge) => far(edge) === other).length === 1 ? other : undefined;
}

/** The one location every view was printed at (`locationRoot`), or nothing when they name more than one. */
function oneLocation(views: readonly AutomationStudioFlowBootstrapPlanHandleView[]): string | undefined {
  const roots = new Set(views.map((view) => locationRoot(view.location)));
  return roots.size === 1 ? [...roots][0] : undefined;
}

/**
 * A location without its query or fragment, in the generic syntax every
 * scheme of location shares (RFC 3986): what follows the first `?` or `#` is
 * dropped, so a choice that only rewrites the query is the same place
 * (header). A location with neither is itself.
 */
function locationRoot(location: string): string {
  const cut = location.search(/[?#]/u);
  return cut === -1 ? location : location.slice(0, cut);
}

/**
 * Refuse a plan that still names a handle anywhere: in a node's parameters, or
 * in a page fact's target in node or Subflow metadata. For plans that reach
 * persistence or apply without passing through resolution.
 */
export function assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan: AutomationStudioFlowBootstrapPlan): void {
  const paths = [
    ...plan.subflows.flatMap((subflow, subflowIndex) => subflow.nodes.flatMap((node, nodeIndex) =>
      automationStudioPlanNodeParametersNameHandle(node.parameters) ? [`plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters`] : [])),
    ...automationStudioPlanMetadataFactHandlePaths(plan)
  ].map((path) => `${path} (${AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved})`);
  if (paths.length) throw new Error(`Invalid Automation Studio Flow Bootstrap plan: ${paths.join(", ")}`);
}

type NodeOutcome =
  | { status: "unchanged" }
  | { status: "resolved"; parameters: JsonObject; handleViews?: AutomationStudioPlanHandleView[]; effect?: JsonObject }
  | { status: "refused"; issueCodes: string[] }
  | { status: "needs_permission"; missing: string[]; requestId: string | null };

async function resolveNode(
  node: AutomationStudioFlowBootstrapNode,
  input: { projectId: string; flowId: string; binding?: ParameterResolver | undefined; handlesIssued: boolean; handleReach?: AutomationStudioPlanHandleReach | undefined; handleEvidence?: JsonObject | undefined; writtenByModel?: boolean | undefined },
  permission: AutomationStudioActionPermissionCheck,
  inherited: boolean,
  modelKeys?: readonly string[] | undefined
): Promise<NodeOutcome> {
  // The declaration comes off first, so nothing downstream -- the handle
  // search, the domain, the registry -- ever sees a parameter no node declares.
  const step = automationStudioPlanStepConsequences(node);
  if (step.malformed) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.consequences);
  const parameters = step.parameters;
  const found = automationStudioPlanNodeHandleSites(parameters);
  if (found.malformed) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.malformed);
  const namesHandle = found.sites.length > 0;
  if (namesHandle && !input.handlesIssued) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notIssued);
  // A step the Flow already runs, untouched: its parameters are the ones the
  // Flow persisted, so there is no handle to resolve, and it is not a step
  // this build adds, so there is nothing new to permit. Asking the domain would
  // refuse a press for a declaration the model never wrote and cannot write
  // for a step it did not take (`./inherited-plan-nodes.ts`). A step that
  // declared anything, or names a handle, is the build's own and goes on.
  if (inherited && step.declared === undefined && !namesHandle) return stripped(step, parameters);
  const resolver = input.binding?.resolvePlanNodeParameters;
  if (typeof resolver !== "function") {
    if (namesHandle) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unsupported);
    // No domain to ask, so a step that says it would do something lasting is
    // one nobody can permit; one that declared nothing lasting stands.
    if (step.declared?.length) return { status: "needs_permission", missing: [...step.declared], requestId: null };
    return stripped(step, parameters);
  }
  let answer: unknown;
  try {
    answer = await resolver.call(input.binding, {
      projectId: input.projectId,
      flowId: input.flowId,
      nodeDefinitionId: node.definitionId,
      parameters: structuredClone(parameters),
      permission,
      ...(step.declared ? { declaredConsequences: [...step.declared] } : {}),
      ...(input.handleReach ? { handleReach: input.handleReach } : {}),
      // The packet as the caller holds it; the domain reads it and keeps nothing of this copy.
      ...(input.handleEvidence ? { handleEvidence: structuredClone(input.handleEvidence) } : {}),
      ...(input.writtenByModel ? { writtenByModel: true as const } : {}),
      ...(!input.writtenByModel && modelKeys?.length ? { modelWrittenParameters: [...modelKeys] } : {})
    });
  } catch {
    return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.failed);
  }
  if (!isRecord(answer)) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.invalid);
  if (answer.status === "refused" && exactKeys(answer, ["status", "issueCodes"]) && Array.isArray(answer.issueCodes)) {
    const codes = [...new Set(answer.issueCodes.filter((code): code is string => typeof code === "string" && ISSUE_CODE.test(code)))].slice(0, MAX_REFUSAL_CODES);
    return codes.length ? { status: "refused", issueCodes: codes } : refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.refused);
  }
  if (answer.status === "needs_permission" && exactKeys(answer, ["status", "missing", "requestId"])) {
    const missing = Array.isArray(answer.missing) ? answer.missing.filter((code): code is string => typeof code === "string" && ISSUE_CODE.test(code)).slice(0, MAX_REFUSAL_CODES) : [];
    const requestId = typeof answer.requestId === "string" && ISSUE_CODE.test(answer.requestId) ? answer.requestId : null;
    // A domain that says "not permitted" and names nothing has not said which
    // classes a person would have to permit, which is the whole of the answer.
    return missing.length ? { status: "needs_permission", missing, requestId } : refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.refused);
  }
  let outcome: NodeOutcome;
  if (answer.status === "unchanged" && exactKeys(answer, ["status"])) outcome = stripped(step, parameters);
  else if (answer.status === "resolved" && isBoundedJsonObject(answer.parameters)
    // `handleViews` only on an answer to a resolution that asked for the view history; `effect` on any (header).
    && keysWithin(answer, ["status", "parameters"], input.handleReach !== undefined ? ["handleViews", "effect"] : ["effect"])
    && (!Object.hasOwn(answer, "handleViews") || isHandleViews(answer.handleViews))) {
    const effect = Object.hasOwn(answer, "effect") ? automationStudioReadRouteSignature(answer.effect) : undefined;
    if (effect && !effect.ok) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.invalid);
    outcome = {
      status: "resolved",
      parameters: structuredClone(answer.parameters),
      ...(isHandleViews(answer.handleViews) ? { handleViews: answer.handleViews.map((view) => ({ handle: view.handle, view: view.view, location: view.location })) } : {}),
      ...(effect?.ok ? { effect: effect.signature } : {})
    };
  } else return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.invalid);
  // Whatever the node leaves with -- its own parameters or the domain's --
  // names no handle.
  const leaving = outcome.status === "resolved" ? outcome.parameters : parameters;
  if (automationStudioPlanNodeParametersNameHandle(leaving)) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved);
  return outcome;
}

/**
 * A node the domain left as written. Its parameters are still rewritten when
 * the step declared its consequences, because the declaration rode on them and
 * a node that kept it would be refused by the registry for a parameter no node
 * has.
 */
function stripped(step: { rodeOnParameters: boolean }, parameters: JsonObject): NodeOutcome {
  return step.rodeOnParameters ? { status: "resolved", parameters } : { status: "unchanged" };
}

/** Whether a fact at `path` sits in a node parameter the model wrote (`modelWrittenParameters`): `...nodes.N.parameters.<key>....`. */
function modelWroteFact(modelKeys: readonly string[] | undefined, path: string): boolean {
  const marker = ".parameters.";
  const at = path.indexOf(marker);
  const key = at < 0 ? undefined : path.slice(at + marker.length).split(".")[0];
  return key !== undefined && modelKeys?.includes(key) === true;
}

function refused(issueCode: string): NodeOutcome {
  return { status: "refused", issueCodes: [issueCode] };
}

function parameterIssue(code: string, path: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message: "A node's parameters were not accepted by the domain that runs it.", path };
}

/**
 * A step nobody permitted. The classes and the request id are Core's own, so
 * the message says which permission would answer it without carrying anything out
 * of the domain.
 */
function permissionIssue(outcome: { missing: string[]; requestId: string | null }, path: string): AutomationStudioFlowBootstrapIssue {
  const asked = outcome.requestId === null ? "nobody was there to ask" : `request ${outcome.requestId} asks for them`;
  return {
    severity: "error",
    code: AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.permission,
    message: `A step would do something lasting the run is not permitted (${outcome.missing.join(", ")}); ${asked}.`,
    path
  };
}

/** A domain's `handleViews` (header): a short list of exactly `{handle, view, location}`, each a handle token, a capture number from 1, and a bounded location. */
function isHandleViews(value: unknown): value is AutomationStudioPlanHandleView[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_HANDLE_VIEWS && value.every((view) =>
    isRecord(view) && exactKeys(view, ["handle", "view", "location"])
    && typeof view.handle === "string" && view.handle.length <= AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH && handleToken().test(view.handle)
    && typeof view.view === "number" && Number.isSafeInteger(view.view) && view.view >= 1
    && typeof view.location === "string" && view.location !== "" && view.location.length <= MAX_VIEW_LOCATION_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Every key of `required` present, and nothing beside them but keys of `optional`. */
function keysWithin(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

/** Plain JSON, no deeper or wider than a plan parameter may be, and small. */
function isBoundedJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value) || !isPlainJson(value)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_RESOLVED_PARAMETER_BYTES;
  } catch {
    return false;
  }
}

function isPlainJson(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 12) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => isPlainJson(item, seen, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 200 && isPlainJson(item, seen, depth + 1));
}
