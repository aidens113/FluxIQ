// The Flow Bootstrap plan contract: the plan a provider emits, the catalog
// and context handed to it, the issues a plan can raise, and the validated
// plan handed on to Bootstrap Adaptations.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationNodeValueType } from "../../../nodes/index.ts";
import type { AutomationStudioRouteSignatures } from "../../route-state/index.ts";
import type { AutomationStudioFlowBootstrapRouteCondition } from "./route-condition.ts";
import type { AutomationStudioFlowBootstrapRoutingContext } from "./routing-context.ts";

export type AutomationStudioFlowBootstrapRisk = "low" | "medium" | "high";

/**
 * The nodes the state-aware recovery grammar is lowered into (contract C1, C4):
 * a step that calls a part, a handler's registration, and the end of a
 * handler's body. Reached only through the script's own statements
 * (`../script-statements/`), never by a step naming one, and read here so the
 * plan's validation can tell a handler's body and a called part from steps
 * nothing reaches.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS = {
  callSubflow: "builtin.control.call-subflow",
  handler: "builtin.control.handler",
  handlerEnd: "builtin.control.handler-end"
} as const;

/**
 * The capability ids a Flow declares under `metadata.requires` (contract C10)
 * when it uses a handler, a part call, or a fact a run observes on the page.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS = {
  handlers: "flow.handlers@1",
  subflowCalls: "flow.subflow-calls@1",
  facts: "web.facts@1"
} as const;

export type AutomationStudioFlowBootstrapNode = {
  key: string;
  definitionId: string;
  definitionVersion: string;
  parameters?: JsonObject;
  outputActionId?: string;
  /**
   * What this step's own action would lastingly do, in the permission gate's
   * classes, as the step declared it.
   *
   * Kept as plain strings on purpose: the vocabulary belongs to
   * `runtime/action-permissions/`, which reads it fail-closed, so nothing here
   * has to learn a word of it. `[]` is a step saying it causes nothing lasting;
   * absent is a step that said nothing at all, and the two are not the same
   * answer.
   */
  consequences?: string[];
  /**
   * The pages the step ran between as the build saw them -- `before`, its
   * expected pre-state, and `after` -- each the host's opaque signature of a
   * route state (`../../route-state/signatures/`). Core-derived only: set
   * from the build's draft, dropped from a plan the model wrote, and written
   * to the Flow node's metadata under `routeSignatures` (`../adaptation.ts`).
   */
  routeSignatures?: AutomationStudioRouteSignatures;
  /**
   * What the Flow node is named: its draft step's described name, in the
   * domain's words (R3-U-12). Core-derived only, as `routeSignatures` is, and
   * written to the Flow node's `label`, which a run's step card shows
   * (`../adaptation.ts`, `../../activity/step/`).
   */
  label?: string;
  /**
   * The least time, in whole milliseconds, between two starts of this node in
   * one run (t378): a span's `repeat pace:` on its first step, or the larger
   * pace a judged trial learned, which promotion keeps
   * (`../../service/candidate-trial/promotion.ts`). Written to the Flow node's
   * `metadata.paceMs` (`../adaptation.ts`), which every graph run honours
   * (`../../executor/pacing/`). Bounded by
   * `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS` (`./limits.ts`).
   */
  paceMs?: number;
  /**
   * Where a run may begin or come back to this node, as the state-aware
   * recovery contract stores it on the Flow node (C2): `fluxiq.entry`, an
   * alternative entry a script's `start at:` declared, and `fluxiq.checkpoint`,
   * a step a script marked `checkpoint: yes`, which a handler's `go to` may
   * route to. Core-derived from the script (`../script-statements/`), never
   * from a model's JSON plan, and written to the Flow node's metadata under
   * the same keys.
   */
  metadata?: AutomationStudioFlowBootstrapNodeMetadata;
};

/**
 * A fact a run observes on the page, as the state-aware recovery contract
 * names it (C9): what to check (`fact`, a check kind the host interprets), how
 * (`op`), against what (`value`, a literal or a Flow input by name) and where
 * (`target`, the handle the evidence printed, or a dialog by its kind and
 * name). Core never interprets `fact` or `target`; the host evaluates the
 * condition and answers true, false or unknown, and unknown never holds.
 *
 * Mirrors the contract's `FactCondition` by name and shape, so the runtime's own
 * type (R1, `executor/lifecycle/`) can replace it without the plan changing.
 */
export type AutomationStudioFlowBootstrapFactCondition = {
  fact: string;
  op: "exists" | "absent" | "visible" | "enabled" | "equals" | "contains" | "matches" | "count";
  value?: string | number | boolean | { input: string } | { value: string };
  target?: { handle: string } | { kind: "dialog"; role: string; name: string };
};

/** An alternative entry (C2): taken at invocation, by ascending `order`, when every `when` holds and every `requires` is bound. */
export type AutomationStudioFlowBootstrapEntry = {
  id: string;
  order: number;
  when: AutomationStudioFlowBootstrapFactCondition[];
  requires: string[];
};

/** A recovery checkpoint (C2): the only node a handler's route may move to. */
export type AutomationStudioFlowBootstrapCheckpoint = {
  id: string;
  when?: AutomationStudioFlowBootstrapFactCondition[];
  requires: string[];
};

export type AutomationStudioFlowBootstrapNodeMetadata = {
  "fluxiq.entry"?: AutomationStudioFlowBootstrapEntry;
  "fluxiq.checkpoint"?: AutomationStudioFlowBootstrapCheckpoint;
};

/**
 * A callable part's interface (C2): the values a calling step passes in by
 * name and the values it hands back. An output carries the binding it is read
 * from inside the part, under `metadata.binding` -- the `$state` binding of
 * one of the part's own steps' outputs -- since nothing else in the part
 * crosses to its caller.
 */
export type AutomationStudioFlowBootstrapInterface = {
  inputs: AutomationStudioFlowBootstrapInterfacePort[];
  outputs: AutomationStudioFlowBootstrapInterfacePort[];
};

export type AutomationStudioFlowBootstrapInterfacePort = {
  id: string;
  name: string;
  valueType: { kind: "unknown" };
  required?: true;
  metadata?: { binding: JsonObject };
};

/** Graph-level declarations of one Subflow: what proves it worked (C2) and what a runtime must support to run it (C10). */
export type AutomationStudioFlowBootstrapSubflowMetadata = {
  "fluxiq.successCheck"?: AutomationStudioFlowBootstrapFactCondition[];
  requires?: string[];
};

export type AutomationStudioFlowBootstrapEdge = {
  key: string;
  source: { nodeKey: string; portId: string };
  target: { nodeKey: string; portId: string };
};

export type AutomationStudioFlowBootstrapSubflow = {
  key: string;
  name: string;
  role: "primary" | "integration" | "recovery" | "fallback" | "utility";
  nodes: AutomationStudioFlowBootstrapNode[];
  edges: AutomationStudioFlowBootstrapEdge[];
  /** A callable part's interface; absent for a Subflow the router runs, whose interface is the Flow's. */
  interface?: AutomationStudioFlowBootstrapInterface;
  metadata?: AutomationStudioFlowBootstrapSubflowMetadata;
};

export type AutomationStudioFlowBootstrapRouter = {
  name: string;
  rules: Array<{
    key: string;
    name: string;
    targetSubflowKey: string;
    routeTags: string[];
    /**
     * When the router takes this rule. Required by validation: a rule with
     * none always holds, and nothing after it could ever run. Optional in the
     * type only so a stored plan written before conditions existed still
     * reads, and is then refused on apply rather than misread.
     */
    condition?: AutomationStudioFlowBootstrapRouteCondition;
  }>;
  fallback: { kind: "subflow"; targetSubflowKey: string } | { kind: "fail" };
};

export type AutomationStudioFlowBootstrapPlan = {
  schemaVersion: "0.1";
  router: AutomationStudioFlowBootstrapRouter;
  subflows: AutomationStudioFlowBootstrapSubflow[];
  /**
   * What a runtime must support to run this Flow (C10), written to the Flow's
   * `metadata.requires`. Present only on a Flow that uses a handler, a part
   * call or a page fact; a Flow without them declares nothing and runs as
   * before.
   */
  metadata?: { requires: string[] };
};

export type AutomationStudioFlowBootstrapCatalogEntry = {
  id: string;
  version: string;
  label: string;
  description: string;
  category: string;
  capabilities: string[];
  inputs: Array<{ id: string; type: AutomationNodeValueType; required?: true; multiple?: true }>;
  outputs: Array<{ id: string; type: AutomationNodeValueType; multiple?: true }>;
  parameters: Array<{
    id: string;
    type: AutomationNodeParameter["valueType"];
    required?: true;
    stateBindable?: false;
    defaultValue?: JsonValue;
    options?: string[];
    constraints?: AutomationNodeParameter["constraints"];
    /** For an object, json or array parameter: what its value holds, bounded. */
    description?: string;
    /** For an object, json or array parameter: a value of the right shape, sent only when it is small. */
    example?: JsonValue;
  }>;
  outputAction?: { required: true; fixed?: string; allowed?: string[] };
};

export type AutomationStudioFlowBootstrapContext = {
  outputSchema: JsonObject;
  /**
   * The Flow's size setting, present only when it is not the default, so a
   * provider adapter holding only the request can size the schema it checks and
   * the plan it parses (`./size-limits.ts`). A default Flow's context is unchanged.
   */
  maxNodesPerSubflow?: number;
  nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[];
  /** Always false: the catalog is every offered node (`./catalog.ts`). Kept so a request reads as it always did. */
  catalogTruncated: boolean;
  catalogSelection: {
    /** The catalog's size in UTF-8 bytes, as measured, never a budget. */
    usedBytes: number;
    requiredTerms: string[];
    missingRequiredTerms: string[];
    /**
     * The parameters this catalog does not describe in full, `<node
     * id>.<parameter id>` each (`./catalog.ts`).
     *
     * Absent when there are none. A parameter named here had an example that
     * could not be written as JSON, so a value written for it is written from a
     * vocabulary the model was never shown -- which every campaign that shortened
     * such text to fit had no way of telling.
     */
    withheldParameterText?: string[];
  };
  /** What the model routes with: the structure as it stands, what a condition can test, and what exploration saw. */
  routing?: AutomationStudioFlowBootstrapRoutingContext;
  /**
   * Where the Flow this build writes starts, in the bound domain's own spelling
   * (`../start-location.ts`).
   *
   * The build is not there: its first step has to be the one that goes there,
   * and the domain refuses everything else until it has. Absent for a build
   * that was given its target instead of being told where it is, which is still
   * the right shape when a person is asking about what is in front of them.
   */
  startLocation?: string;
  /**
   * Every node by id and what it does, by category (`./catalog-names.ts`).
   * Evidence decisions only: it is what such a decision is shown in place of
   * `nodeCatalog` (`../../llm/deepseek/request-body.ts`), which the packet still
   * carries whole for every reader that checks it.
   */
  catalogNames?: AutomationStudioFlowBootstrapCatalogNames;
  /**
   * The full entries of the nodes this build has run or asked `core.describe_nodes`
   * about, in the order first described; ids the catalog does not hold are
   * skipped. Evidence decisions only, and absent until a node is described.
   * Append-only for the length of a build, so it never cuts the cached prefix
   * of a request that repeats it.
   */
  describedNodes?: AutomationStudioFlowBootstrapCatalogEntry[];
};

/**
 * Every node of a catalog by id and what it does, by category
 * (`./catalog-names.ts`): `{ "<category>": ["<id>: <description>", ...] }`.
 */
export type AutomationStudioFlowBootstrapCatalogNames = Record<string, string[]>;

export type AutomationStudioFlowBootstrapIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

export type AutomationStudioValidatedFlowBootstrapPlan = {
  plan: AutomationStudioFlowBootstrapPlan;
  risk: AutomationStudioFlowBootstrapRisk;
  subflows: Array<Omit<AutomationStudioFlowBootstrapSubflow, "nodes"> & {
    nodes: Array<AutomationStudioFlowBootstrapNode & { position: { x: number; y: number } }>;
  }>;
};
/** Registry-validated, Core-risked and deterministically laid-out plan accepted by Bootstrap Adaptations. */
export type AutomationStudioFlowBuildPlan = AutomationStudioValidatedFlowBootstrapPlan;
