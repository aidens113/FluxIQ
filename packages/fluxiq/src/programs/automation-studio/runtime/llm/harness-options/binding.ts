// The bridge from the one mutable slot to the registry.
//
// Until now a host bound a single `llmEvidenceRuntime` object: a bare list of
// tools, an executor, and two optional callbacks, with no domain id, no merge
// and no gate. The whole object was handed to the loop unfiltered, so the last
// bind won and Core could not say whose tools those were.
//
// The slot keeps working. It gains one required field -- the domain it belongs
// to -- and is adapted here into an ordinary domain bundle, so a host that
// changes nothing else keeps its three tools and gains the gate, and Core's
// own options appear beside them as soon as a host port is bound.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type {
  AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
import type { AutomationStudioExplorationRefusalClassifier, AutomationStudioExplorationStateDigestPhase } from "../../recovery/index.ts";
import type { AutomationStudioLlmDomainSystemInstructions } from "../domain-instructions/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioLlmFailureEvidenceCaptureInput, AutomationStudioRuntimeTargetOverrideTarget } from "../harness.ts";
import {
  AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
  automationStudioLlmDescribeNodesBundle,
  automationStudioLlmRunNodeDescribingFailures,
  automationStudioLlmRunNodeTool,
  type AutomationStudioLlmNodeDescriptions
} from "../node-tools/index.ts";
import type { AutomationStudioHarnessOptionHost } from "./host.ts";
import type { AutomationStudioHarnessOption, AutomationStudioHarnessOptionBundle, AutomationStudioHarnessOptionImplementation } from "./option.ts";
import { AutomationStudioHarnessOptionRegistry } from "./registry.ts";

/**
 * What a host binds to give the loop its domain's actions.
 *
 * `domainId` is the field the slot never had, and everything the registry does
 * about scoping follows from it.
 */
export type AutomationStudioLlmEvidenceRuntimeBinding = {
  domainId: string;
  /**
   * What this domain tells the model on every request made for its work, in
   * its own words: how its pages, controls and evidence read, and the habits
   * that work on its medium.
   *
   * **Why.** Core's system message is generic by design, and until now a
   * domain could add to it only through a staged request's gather stage --
   * which reaches one stage of one loop, not the bootstrap, a repair, a result
   * check or the chat. What a domain knows about its own medium belongs in
   * every one of those, so it is bound once, here.
   *
   * **Bound.** `version` matches `^[a-z0-9][a-z0-9._-]{0,63}$`; `text` is not
   * blank, at most `AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH`
   * (4,000) characters, with no control character but a line feed. Checked
   * when the runtime is bound, so a bad text fails there and never mid-build
   * (`../domain-instructions/validate.ts`).
   *
   * **Placement.** Every provider the service resolves for this domain's work
   * stamps it on each request (`../domain-instructions/provider.ts`), and the
   * adapter puts it in the system message after Core's output-format and
   * injection rules and before Core's task prose, inside the prefix that does
   * not change between calls (`../deepseek/system-prompt.ts`). The chat's
   * interpreter is given it in the same position relative to its own fixed
   * vocabulary (`../../conversations/instructions/prompt.ts`).
   *
   * **Never a replacement.** It is added to Core's rules, never instead of
   * them: the JSON-only answer, the treatment of supplied strings as data, and
   * the output schema stay Core's and are always sent. Absent, every request
   * is exactly what it was.
   */
  systemInstructions?: AutomationStudioLlmDomainSystemInstructions;
  /**
   * What a call names, in words a person reads: the control its handle names
   * on the page the domain last showed, and the words it types or looks for --
   * never a value this domain screens as sensitive. For the chat alone
   * (`../../activity/observer.ts`); nothing decides anything by it. Absent, the
   * chat says the call's verb alone ("Typing into the page").
   */
  describeCall?(input: { projectId: string; flowId: string; toolId: string; value: JsonObject }): { target?: string | undefined; text?: string | undefined } | undefined;
  /**
   * Keys that may never appear in the failure evidence or the reusable context
   * this domain produces, because for its medium they carry raw payload or
   * something the model could execute or address directly.
   *
   * Core used to hold this list itself, naming `html`, `cookies`, `headers` and
   * the rest -- a browser's and an HTTP client's vocabulary inside a framework
   * that must have neither, which also enforced nothing for a domain whose raw
   * payload goes by another name. The only party that knows what raw payload
   * looks like is the domain, so the domain declares it. Core still bounds
   * depth, size and shape whatever is declared.
   *
   * Required, and deliberately so. An absent field used to mean "deny nothing",
   * so a domain that simply forgot got no protection at all and nothing said
   * so. Declaring `[]` is a domain stating it has nothing of the sort, which a
   * reviewer can see and argue with; an absent field is not. Core's packet
   * builder refuses to carry evidence or reusable context that arrives with no
   * declaration at all, so the compile-time rule and the run-time rule agree.
   */
  deniedEvidenceKeys: readonly string[];
  /**
   * The top-level keys of a tool result's value that are this domain's view of
   * its target as the call saw or left it -- for the web domain, the page.
   *
   * Core shows each decision the newest such view whole, and in every earlier
   * result replaces exactly these keys with a reference to the result that
   * replaced them, keeping the rest of it -- what the step did and what
   * changed (`../context-window.ts`). Only the domain knows which keys those
   * are, so the domain declares them, as it declares `deniedEvidenceKeys`.
   * Absent, every result is shown whole in every later decision, which is
   * what overflowed live builds (B1, `run-mup2i28c-6c7fc209`).
   *
   * A key written `holder.member` is a member of the object a result holds
   * under `holder` -- for the web domain, a read's rows inside its `read` --
   * and is a view of its own kind, replaced only by the next result whose same
   * holder carries one; the loop is then offered `core.recall_result` to get
   * an earlier one back whole (t194 w48, `../evidence-recall/`).
   */
  observedStateKeys?: readonly string[];
  /**
   * The keys under which this domain's step arguments carry the row a control
   * was found in -- for the web domain, a press's `element.context.record`.
   *
   * A step repeated over another step's rows is given each kept row in turn,
   * which replaces that row, so the judge of a build's test is not told the row
   * the step was built on as if it were the one it acts on
   * (`../../result-verification/build-test/summary.ts`, live run
   * `run-murwcaj0-40e56557`). Only the domain knows which keys hold a row, so
   * the domain declares them, as it declares `deniedEvidenceKeys`. Absent,
   * nothing is left out.
   */
  rowContextKeys?: readonly string[];
  /**
   * Where a list read's answer holds the records it kept, written `holder.member`
   * as in `observedStateKeys` -- for the web domain, `read.extracted`. A repair
   * compares a rerun of the read a judged test blamed with the rows Core's check
   * named (`../node-tools/rerun-checked-rows.ts`, live run
   * `run-mux6naez-6c20f26e`, R3-3), and only the domain knows which member is
   * the kept rows rather than the rejected ones. Absent, only an answer that
   * names its rows under Core's own `readRows` is compared.
   */
  readRowsKey?: string;
  tools: AutomationStudioLlmEvidenceTool[];
  /**
   * Whether this domain can run a node of the library against its live target,
   * and what one first look at that target costs nothing to take.
   *
   * A domain that declares it is offered one more option: the library itself
   * (`../node-tools/run-node.ts`). The names it may run are read from the node
   * registry at the moment the option is built, so a node registered later
   * appears with nobody editing anything, and the call arrives at
   * `executeTool` under `AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID` with the node
   * and its parameters inside the value.
   *
   * `initial` is one call the *domain* writes rather than the model: the loop
   * makes it before the first paid decision, so the model's first question is
   * asked with the target already in front of it. A domain that offers one is
   * stating that this particular call only looks.
   */
  runsNodes?: {
    initial?: JsonObject;
    /**
     * The node that takes this domain's target to a location, and the name of
     * its parameter the location is written into.
     *
     * A build told where its Flow starts (`startLocation`) then opens by going
     * there rather than with `initial`: the loop runs this node with the
     * location as that parameter, before the first paid decision, and keeps the
     * step as the Flow's first (`../evidence-loop.ts`). Without it, a domain
     * that refuses every call made before the Flow has reached its start --
     * the web domain does -- refused the free look of every such build, and
     * the model spent its first paid decision on the navigation Core could
     * have made (F31, `run-muqc07fh-eeffbc86` steps 0002-0004). Core still
     * never reads the location: it is the domain's spelling, put where the
     * domain said.
     *
     * Used only when the build has a `startLocation`, `initial` is declared
     * (the arrival rides on it), and the node is one this binding offers. A
     * round whose draft already holds the Flow (a repair's, a re-author's)
     * never arrives: it opens with the `initial` look where the test left the
     * page, carrying the Flow's calls under `held` (run 38 C3, t241).
     */
    arrival?: { node: string; parameter: string };
    /**
     * The nodes this domain will actually run against its target, by id. Given,
     * the library offered to the model is narrowed to these.
     *
     * **Why it has to be said rather than assumed.** The names offered were the
     * whole registry for the build's resolution, and Core's own built-ins are
     * adapted with `availability: { kind: "both" }`
     * (`nodes/definitions.ts`), so they pass every scope. A web build was
     * therefore handed `builtin.control.for-each`, `builtin.data.filter-list`,
     * `builtin.data.write-records` and the rest inside a closed `enum`, told to
     * name one "exactly as the catalog prints its id", and every call naming
     * one was sent to the domain -- which runs web nodes and refuses everything
     * else. The model was being offered nodes whose only possible answer was a
     * refusal.
     *
     * **Why narrowing costs the model nothing.** This option means "run a node
     * against the live target", and a structural node has no target to run
     * against. Control flow is not named here at all: the model authors it as a
     * routing word on steps it has already run -- `repeat`, `only_if`,
     * `on_failed` (`../../flow-draft/routing.ts`) -- and Core derives the nodes
     * from that. Filtering and record output are parameters of the extraction
     * node. So nothing the model needs to express leaves with these names.
     *
     * Absent, every name in the registry is offered, which is what a domain
     * that runs anything Core can resolve would want.
     */
    runnable?: readonly string[];
  };
  /**
   * Options the domain declares in full, rather than as bare tools. Unlike
   * `tools`, these carry their own availability, safety and stages, so a
   * runtime-only option never reaches Flow authoring.
   */
  harnessOptions?: AutomationStudioHarnessOptionBundle;
  /**
   * How this domain reads a tool result code that means "the harness declined
   * to act", so the exploration runner can stop on a refusal without Core
   * knowing any of the domain's result codes.
   */
  classifyRefusal?: AutomationStudioExplorationRefusalClassifier;
  executeTool(input: {
    projectId: string;
    flowId: string;
    callId: string;
    toolId: string;
    value: JsonObject;
    signal?: AbortSignal;
    /**
     * Where the Flow being built starts, when the build was told
     * (`../../flow-bootstrap/start-location.ts`). Core carries the domain's own
     * spelling of it and never reads it.
     *
     * It is on every call rather than on the binding because it belongs to one
     * build, and a binding outlives every build made through it. What the domain
     * does with it is the domain's: the web domain refuses any call made before
     * the Flow has reached it, which is what makes the step that reaches it the
     * first step of the draft.
     */
    startLocation?: string;
    /**
     * The run's permission check for this action. A tool whose action has a
     * lasting consequence calls it before acting and acts only on
     * `permitted: true`; see `AutomationStudioHarnessOptionExecution.permission`.
     */
    permission: AutomationStudioActionPermissionCheck;
  }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /**
   * What the state was at one moment, as an opaque digest Core only ever
   * compares for equality.
   *
   * Asked once before each exploration action and once after it, and it is the
   * one input a reduction of that exploration cannot be computed without: Core
   * knows which action ran and what it returned, and nothing at all about
   * whether the world changed. The contract the answer must satisfy -- stable
   * across a step that changed nothing the automation depends on, different
   * after a step that did -- is stated in full beside the type, in
   * `runtime/recovery/exploration-state/digest-source.ts`.
   *
   * Optional, because a domain that has no way to observe its own state should
   * say nothing rather than invent a digest: an exploration with no digests is
   * simply not reduced, and says so. What it must never be is a digest of the
   * evidence the step returned, which is what the step said rather than what
   * the world was.
   */
  captureStateDigest?(input: {
    projectId: string;
    flowId: string;
    callId: string;
    toolId: string;
    phase: AutomationStudioExplorationStateDigestPhase;
    /**
     * Where the Flow being built starts, when the build was told
     * (`../../flow-bootstrap/start-location.ts`). Present, nothing was opened
     * for this build, so the state before its first step is *no state*: a
     * domain that says nothing then leaves the step undigested, which the
     * reduction reports, rather than throwing and making the first step of
     * every such build a recorded failure.
     */
    startLocation?: string;
    signal?: AbortSignal;
  }): Promise<string | undefined>;
  /**
   * True when every execution result this binding returns reports the state it
   * found and left on `stateDigests`, digested from the captures the call
   * itself took (`../evidence-loop/tool-execution.ts`). A build loop then never
   * asks `captureStateDigest` around a call: that question used to cost the web
   * domain a whole extra page capture on each side of every step.
   * `captureStateDigest` stays for the callers that ask about a moment no call
   * brackets.
   */
  stateDigestsOnCalls?: true;
  captureSanitizedFailureEvidence?(input: AutomationStudioLlmFailureEvidenceCaptureInput): Promise<JsonObject | undefined>;
  /**
   * Judge a repair target against one packet this domain issued, and resolve it.
   *
   * `evidence` is exactly one packet the patch request showed the model: the
   * failure packet, or a packet one of this domain's exploration options
   * returned during the same recovery. Core asks about the one packet the
   * target's handles came from and passes the handles as this domain issued
   * them; Core's own `<evidenceId>:` qualifier, which says which explored
   * packet a handle came from, is removed first. A target whose handles come
   * from more than one packet, or name an explored packet the request did not
   * carry, is refused by Core without asking. So a domain that numbers its
   * handles per packet needs nothing new: each call is one packet, as before.
   *
   * `matched` means the target stands as it was passed here, without the
   * qualifier. Every call is guarded: a throw is read as `absent`.
   */
  validateTargetOverrideEvidence?(
    evidence: JsonObject,
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ): AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  /**
   * Turn a generated plan node's parameters into the ones it really runs with,
   * or refuse the node.
   *
   * The model names what it observed only by the handles this domain issued in
   * its evidence, written as `{ "handle": "<token>" }` where a real value --
   * a target, an extraction item -- belongs. After exploration and before the
   * plan is validated, Core calls this once for every node of the plan, with a
   * copy of the node's parameters as the model wrote them.
   *
   * - `unchanged`: the parameters stand as written. Right for a node this
   *   domain does not own, or one that names no handle.
   * - `resolved`: the node's complete parameters, every handle reference
   *   replaced from the resolutions the domain retained when it issued them.
   * - `refused`: the node cannot run as written -- a handle this domain never
   *   issued, one that no longer points at anything, or anything else the
   *   domain will not accept. Issue codes only (`^[a-z0-9_.:-]{1,100}$`).
   * - `needs_permission`: the step would lastingly do something the run is not
   *   permitted. Not a refusal of how the step was written and not the model's
   *   to correct -- a person answers it -- so it is reported apart from one.
   *
   * Core trusts none of the answer. A throw, a malformed answer, parameters
   * that are not plain bounded JSON, or parameters that still name a handle
   * (including `unchanged` ones) all refuse the node, and so does naming a
   * handle when this is not implemented. A refused node fails plan validation
   * and never reaches dispatch.
   */
  resolvePlanNodeParameters?(input: {
    projectId: string;
    flowId: string;
    nodeDefinitionId: string;
    parameters: JsonObject;
    /**
     * The build's permission check for this step of the Flow. A step whose
     * action would have a lasting consequence every time the Flow runs is
     * declared here -- the classes from `declaredConsequences`, and which
     * control and which verb from the domain, which alone knows them -- and a
     * step the build is not permitted answers `needs_permission`. Core then
     * ends the build with the request rather than handing it back to the model,
     * so a Flow that would refund, delete or send is never built without the
     * person having said it may.
     */
    permission: AutomationStudioActionPermissionCheck;
    /**
     * What the step itself said it would lastingly do, in Core's classes and
     * Core's order, read off the step by
     * `automationStudioPlanStepConsequences`. Absent when the step declared
     * nothing; empty when it declared, in so many words, that it causes nothing
     * lasting. Only the model can know which it is -- it explored the page --
     * so nothing here is Core's or the domain's reading of what a control looks
     * like. Whether a step of a given kind may leave it unsaid is the domain's
     * call, because only the domain knows whether the step acts.
     */
    declaredConsequences?: readonly AutomationStudioActionConsequence[] | undefined;
    /**
     * Which of exploration's views a handle may resolve from. Absent, the
     * domain resolves against the page as exploration last saw it, as it
     * always has. `view_history`, sent for a candidate submission alone
     * (t358): a candidate is a whole Flow written after exploration, and its
     * first steps act on pages exploration has since left, so any control
     * exploration was shown may be named, resolved to the durable locator its
     * views agree on. Only then may a resolved answer carry `handleViews`.
     */
    handleReach?: AutomationStudioPlanHandleReach | undefined;
  }): AutomationStudioPlanNodeResolution | Promise<AutomationStudioPlanNodeResolution>;
};

/** Which views a plan node's handles may resolve from (`resolvePlanNodeParameters`, `handleReach`). */
export type AutomationStudioPlanHandleReach = "view_history";

/**
 * The view one handle of a resolved node came from, as the domain numbers its
 * captures (from 1, in the order exploration took them), and the location that
 * view reported. A record of where a candidate's target was learned, never
 * authority to act.
 */
export type AutomationStudioPlanHandleView = { handle: string; view: number; location: string };

/** A domain answer about one plan node. May be awaited: asking permission is. */
export type AutomationStudioPlanNodeResolution =
  | { status: "unchanged" }
  /** `handleViews` only on an answer to a resolution that asked for `view_history`; Core refuses it on any other. */
  | { status: "resolved"; parameters: JsonObject; handleViews?: readonly AutomationStudioPlanHandleView[] }
  | { status: "refused"; issueCodes: readonly string[] }
  | { status: "needs_permission"; missing: readonly string[]; requestId: string | null };

/**
 * The registry for one host: Core's own options for whatever host port is
 * bound, extended by the bound domain's own. Either half may be absent, which
 * is how a host that binds nothing behaves exactly as it did before.
 */
export function automationStudioHarnessOptionRegistry(input: {
  // Explicitly `| undefined` so a caller can pass its own optional field
  // straight through under exactOptionalPropertyTypes.
  host?: AutomationStudioHarnessOptionHost | undefined;
  binding?: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
  /**
   * Every node this call may run, by id, from the same registry the Flow is
   * written against. Given, and with a binding that says it runs nodes, the
   * library itself is offered as one option.
   */
  nodeIds?: readonly string[] | undefined;
  /**
   * Where the Flow this build writes starts, when the build was told
   * (`../../flow-bootstrap/start-location.ts`). Passed to the domain on every
   * call this registry makes, and to nothing else: the registry is built per
   * build, which is the scope the value has.
   */
  startLocation?: string | undefined;
  /**
   * The build's described-node memory (`../node-tools/node-descriptions.ts`).
   * Given, and with the library on offer, the model may ask for nodes' full
   * definitions (`core.describe_nodes`), and a library call that fails naming
   * a node it never asked about describes that node on the way back.
   */
  nodeDescriptions?: AutomationStudioLlmNodeDescriptions | undefined;
}): AutomationStudioHarnessOptionRegistry {
  const registry = new AutomationStudioHarnessOptionRegistry(input.host ? { host: input.host } : {});
  // Only the names the domain said it runs. A node it will refuse is not a
  // choice the model should be given: the enum is closed and the model is told
  // to copy from it, so every name here that the domain cannot run is a paid
  // call whose only answer is `node_not_runnable_here`.
  const offeredNodeIds = runnableNodeIdsFor(input.binding, input.nodeIds);
  const runsNodes = input.binding?.runsNodes;
  // A build told where it starts opens by going there (`runsNodes.arrival`);
  // one that was not -- including a continuation, which passes no start --
  // opens with the look, as before.
  const arrival = runsNodes?.arrival && input.startLocation ? { ...runsNodes.arrival, location: input.startLocation } : undefined;
  const runNode = runsNodes && offeredNodeIds?.length
    ? automationStudioLlmRunNodeTool({ nodeIds: offeredNodeIds, ...(runsNodes.initial ? { initial: runsNodes.initial } : {}), ...(arrival ? { arrival } : {}) })
    : undefined;
  if (input.binding && (input.binding.tools.length || input.binding.harnessOptions?.options.length || runNode)) {
    const bundle = automationStudioHarnessOptionBundleFromBinding(input.binding, runNode, input.startLocation);
    // Describing is offered only beside the library it describes: with nothing
    // to run, a definition is nothing the model can use.
    const memory = runNode ? input.nodeDescriptions : undefined;
    const runImplementation = bundle.implementations[AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID];
    if (memory && runImplementation) bundle.implementations[AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID] = automationStudioLlmRunNodeDescribingFailures(runImplementation, memory);
    registry.register(bundle);
    if (memory) registry.register(automationStudioLlmDescribeNodesBundle(memory));
  }
  return registry;
}

/**
 * A harness input carrying the bound domain's declared denied keys.
 *
 * Flow Bootstrap assembles its own harness input and never forwarded them, so
 * its reusable context reached the model with only Core's own `target` family
 * denied and none of the domain's raw-payload nouns -- silently, because an
 * absent declaration used to mean "deny nothing". Forwarded, never defaulted:
 * a `?? []` in this position would restore exactly the default-open that
 * making the declaration required exists to close.
 */
export function automationStudioHarnessInputWithDeniedEvidenceKeys<Input extends { deniedEvidenceKeys?: readonly string[] }>(
  input: Input,
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined
): Input {
  if (!binding) return input;
  return { ...input, deniedEvidenceKeys: binding.deniedEvidenceKeys };
}

/**
 * One domain's bound tools as a bundle the registry can hold, with the library
 * itself beside them when the domain can run it.
 *
 * The library option is scoped to the domain like any other, because the thing
 * that carries it out is this domain's executor: Core builds the declaration
 * from the registry and the domain runs what the call names.
 */
export function automationStudioHarnessOptionBundleFromBinding(
  binding: AutomationStudioLlmEvidenceRuntimeBinding,
  runNode?: AutomationStudioLlmEvidenceTool,
  startLocation?: string
): AutomationStudioHarnessOptionBundle {
  const implementations: Record<string, AutomationStudioHarnessOptionImplementation> = {};
  const options = [...binding.tools, ...(runNode ? [runNode] : [])].map((tool) => {
    implementations[tool.toolId] = executionFor(binding, tool.toolId, startLocation);
    return scopedOption(tool, binding.domainId);
  });
  const declared = binding.harnessOptions;
  if (declared) {
    if (declared.domainId !== binding.domainId) {
      throw new Error(`Automation Studio harness options declare domain "${declared.domainId}" on a runtime bound for "${binding.domainId}".`);
    }
    for (const option of declared.options) {
      const implementation = declared.implementations[option.toolId];
      if (!implementation) throw new Error(`Automation Studio harness option "${option.toolId}" has no implementation.`);
      options.push(option);
      implementations[option.toolId] = implementation;
    }
  }
  return { schemaVersion: "0.1", domainId: binding.domainId, options, implementations, ...(binding.observedStateKeys?.length ? { observedStateKeys: [...binding.observedStateKeys] } : {}) };
}

/**
 * The library as this binding will actually answer for it: the registry's names
 * where the domain named none, and otherwise their intersection.
 *
 * The intersection rather than the domain's list outright, because the
 * resolution the build was given is what decides availability -- a node the
 * domain can run but this scope, capability set or permission set excludes is
 * still not on offer.
 */
function runnableNodeIdsFor(
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined,
  nodeIds: readonly string[] | undefined
): readonly string[] | undefined {
  const runnable = binding?.runsNodes?.runnable;
  if (!runnable || !nodeIds) return nodeIds;
  const offered = new Set(runnable);
  return nodeIds.filter((id) => offered.has(id));
}

function scopedOption(tool: AutomationStudioLlmEvidenceTool, domainId: string): AutomationStudioHarnessOption {
  return {
    toolId: tool.toolId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.effect !== undefined ? { effect: tool.effect } : {}),
    ...(tool.perCallEffect === true ? { perCallEffect: true as const } : {}),
    ...(tool.actionInputKey !== undefined ? { actionInputKey: tool.actionInputKey } : {}),
    ...(tool.repeatPolicy !== undefined ? { repeatPolicy: tool.repeatPolicy } : {}),
    ...(tool.initialObservation !== undefined ? { initialObservation: tool.initialObservation } : {}),
    availability: { kind: "domain", domainId },
    // The slot never declared a side effect, so it is read off what the loop
    // already tracks. A domain that wants a narrower or wider declaration says
    // so by registering a bundle of its own instead of using the slot.
    safety: { sideEffect: tool.effect === "mutate" ? "mutate" : "observe" }
  };
}

function executionFor(binding: AutomationStudioLlmEvidenceRuntimeBinding, toolId: string, startLocation?: string): AutomationStudioHarnessOptionImplementation {
  return (input) => binding.executeTool({
    projectId: input.projectId,
    flowId: input.flowId,
    callId: input.callId,
    toolId,
    value: input.value,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
    // Every call of this build, including the opening call the loop makes
    // before the first paid decision: the arrival at it when the binding
    // declares one, and otherwise the free look, which is where a domain says
    // "you are not there yet, and here is where you are meant to be".
    ...(startLocation === undefined ? {} : { startLocation }),
    permission: input.permission
  });
}
