import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { randomUUID } from "node:crypto";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandContext } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AUTOMATION_STUDIO_REQUIRED_COMMAND_NOT_SENT, AUTOMATION_STUDIO_REQUIRED_OUTCOME_UNKNOWN, type AutomationStudioExecutorCommandRun, type AutomationStudioExecutorNodeEntry } from "../command-scope/index.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodeExpectationEvaluator, AutomationNodePort } from "../../../nodes/index.ts";
import { combineAutomationStudioResolvedActionEffects, getAutomationNodeDefinition, readAutomationStudioResolvedActionEffect, resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import { hostExpectationEvaluator, hostRuntimeCapabilityIds, type AutomationStudioHostStateSnapshotRef } from "../../host-runtime.ts";
import { AUTOMATION_STUDIO_ASK_EFFECT } from "../../parking/index.ts";
import { nodeAttemptFromResult } from "../attempt-trace.ts";
import type { AutomationStudioClearedLayer, AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioObstruction, AutomationStudioRecordBatch } from "../contracts.ts";
import { automationStudioFaultFromThrownError, automationStudioNodeSideEffectClass, automationStudioThrownErrorText } from "../defensive/index.ts";
import { captureHostState, enrichAttemptWithHostState } from "../host-state.ts";
import { automationStudioNodeOutputReferences, collectNodeInputs, collectWiredNodeInputs } from "../node-inputs.ts";
import { captureAutomationStudioRecordBatch, captureAutomationStudioWrittenRecords } from "../record-capture.ts";
import type { AutomationStudioRunState } from "../run-state.ts";
import type { AutomationStudioTraceWithholding } from "../trace-withholding.ts";
import { emitAutomationStudioActivity, emitAutomationStudioActivityClearedWait, emitAutomationStudioActivityStepInterference } from "../../activity/index.ts";
import { attemptWithHostExpectationEvaluation } from "../transition-comparison.ts";

import { automationStudioClearedLayersOf } from "./cleared-layers.ts";
import { automationStudioObstructionOf } from "./obstruction-of.ts";
import { automationStudioResultPathOutputs } from "./result-path-outputs.ts";
import { automationStudioAttemptWithRecordedEffect } from "./recorded-effect.ts";
import { automationStudioAttemptAlreadyInState } from "./already-in-state.ts";
import { automationStudioNodeAttemptFailure } from "./failure.ts";
import { automationStudioCallSubflow } from "../frames/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, controlFlowNodes } from "../../../nodes/control-flow/index.ts";
import { dataNodes } from "../../../nodes/data/index.ts";
import { logicNodes } from "../../../nodes/logic/index.ts";
import { mathNodes } from "../../../nodes/math/index.ts";
import { policyNodes } from "../../../nodes/policy/index.ts";
import { randomNodes } from "../../../nodes/random/index.ts";
import { timingNodes } from "../../../nodes/timing/index.ts";

// `cleared` collects the layers each dispatch of the attempt says the client
// closed over the page (`./cleared-layers.ts`), in dispatch order;
// `obstruction` keeps the layer the latest dispatch that reported one says
// stood over the page (`./obstruction-of.ts`, CC7), a failed dispatch's too.
type RecordCaptureTarget = { runState: AutomationStudioRunState; nodeId: string; attemptId: string; consumer?: object; cleared?: AutomationStudioClearedLayer[]; obstruction?: AutomationStudioObstruction };
type EffectDispatchContext = Parameters<NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>>[1];
const RECORDS_WRITE_EFFECT = "records.write";
const PERSIST_FAILED_MESSAGE = "The output ran, but the records it returned could not be saved.";
const WRITE_PERSIST_FAILED_MESSAGE = "The records could not be saved.";

/** Owns the actual node attempt, effect capture and private execution provenance. */
export class AutomationStudioNodeAttemptExecution {
  private static readonly trustedDefinitions = new Map([...controlFlowNodes, ...dataNodes, ...logicNodes, ...mathNodes, ...policyNodes.filter(definition => definition.id === "builtin.policy.action" || definition.id === "builtin.policy.recovery"), ...randomNodes, ...timingNodes].map(definition => [definition, definition.execute]));
  private static readonly entries = new WeakMap<object, AutomationStudioExecutorNodeEntry>();
  private static readonly handling = new WeakMap<object, Map<object, { context: ClientGatewayCommandContext; run: AutomationStudioExecutorCommandRun; witness: object }>>();
  static readEntry(consumer: object, run: AutomationStudioExecutorCommandRun): AutomationStudioExecutorNodeEntry {
    const entry = this.entries.get(consumer);
    if (!entry || entry.run !== run) throw new Error("executor.foreign_node_entry");
    return entry;
  }
  static readHandling(consumer: object, capability: object, context: ClientGatewayCommandContext, run: AutomationStudioExecutorCommandRun): object | null {
    this.readEntry(consumer, run);
    const handled = this.handling.get(consumer)?.get(capability);
    return handled && handled.context === context && handled.run === run ? handled.witness : null;
  }
  static async execute(
    flow: AutomationStudioFlowDocument,
    node: AutomationStudioFlowNode,
    values: Record<string, JsonValue>,
    options: AutomationStudioGraphExecutionOptions,
    attemptNumber: number,
    withholding: AutomationStudioTraceWithholding,
    runState: AutomationStudioRunState
  ): Promise<AutomationStudioNodeAttemptTrace> {
    await options.commandRun?.checkpoint();
    const startedAt = options.now?.() ?? Date.now();
    const attemptId = `${node.id}.attempt.${attemptNumber}`;
    const consumer = options.commandRun ? Object.freeze({}) : undefined;
    if (consumer) this.entries.set(consumer, Object.freeze({ run: options.commandRun!, invocationId: randomUUID(), attemptId, nodeId: node.id, executingFlowId: flow.flowId, executingFlowDigest: Rules.digest(flow) }));
    const definition = getAutomationNodeDefinition(node.definitionId);
    if (options.commandRun && definition?.execute && (!this.trustedDefinitions.has(definition) || this.trustedDefinitions.get(definition) !== definition.execute)) {
      await options.commandRun.stop("executor.unsupported_definition");
      throw new Error("executor.unsupported_definition");
    }
    const inputs = collectNodeInputs(flow, node, values);
    // A parameter reading another node's output names that node by its key in
    // the graph; it is read under the id the run keeps its outputs at (`./node-inputs.ts`).
    const authoredParameters = automationStudioNodeOutputReferences(flow, node.parameterValues ?? {});
    const resolvedParameters = resolveAutomationNodeParameterValues(authoredParameters, {
      ...(options.inputs ?? {}),
      // The run's live variables, not the seed it started from: a variable written
      // during the run -- inside a For Each body, say -- is what a later node's
      // binding has to read. `runState.variables` is seeded from
      // `options.variables`, so a run that writes none resolves exactly as before.
      ...Object.fromEntries(runState.variables),
      ...values,
      ...inputs
    });
    // Recorded before any branch below can return: what resolution supplied is
    // withheld from the trace whether or not this node goes on to execute, and
    // whether or not the rest of its bindings resolved.
    withholding.record(authoredParameters, resolvedParameters.values);
    const executionNode = resolvedParameters.missingPaths.length
      ? node
      : { ...node, parameterValues: resolvedParameters.values };
    // This frame's floor is resolved before any host/native/output call. On a
    // missing binding keep its raw slot; a dropped slot is not an absent value
    // to which a trusted false schema default may honestly apply.
    runState.actionEffects.delete(node.id);
    try {
      const actionEffect = options.resolveActionEffect?.(node, resolvedParameters.missingPaths.length ? authoredParameters : resolvedParameters.values);
      if (actionEffect) runState.actionEffects.set(node.id, readAutomationStudioResolvedActionEffect(actionEffect));
    } catch {
      return {
        attemptId, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [],
        message: "The trusted action-effect declaration could not be resolved; the action was not run.",
        failure: { category: "graph_validation_or_unknown_node", code: "executor.action_effect.resolve_failed", retryable: false, stage: "dispatch", effect: "unacted" }
      };
    }
    const hostCapabilities = hostRuntimeCapabilityIds(options.hostRuntime);
    if (resolvedParameters.missingPaths.length) {
      return {
        attemptId,
        nodeId: node.id,
        definitionId: node.definitionId,
        startedAt,
        finishedAt: options.now?.() ?? Date.now(),
        status: "failed",
        route: "failed",
        inputs,
        outputs: {},
        effects: [],
        message: `State-bound parameter path${resolvedParameters.missingPaths.length === 1 ? "" : "s"} could not be resolved: ${resolvedParameters.missingPaths.join(", ")}.`,
        // Named as a refusal rather than left blank. A binding onto a value nothing
        // produced is a Flow defect, and a defect answers the same way however many
        // times it is asked, so the retry loop must be told so explicitly instead of
        // inferring it from a missing record.
        failure: { category: "graph_validation_or_unknown_node", code: "executor.parameter.unresolved_state_path", retryable: false, stage: "dispatch", effect: "unacted" }
      };
    }
    const beforeAction = await captureHostState(options, { node: executionNode, attemptId, inputs, point: "before_action" }, runState);
    if (options.signal?.aborted) throw new Error("Node execution was cancelled before dispatch.");
    if (definition && node.definitionVersion && node.definitionVersion !== "1.0.0") {
      return await enrichAttemptWithHostState(executionNode, { attemptId, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [], message: `Node ${node.definitionId} pins ${node.definitionVersion}, but built-in version 1.0.0 is available.`, failure: { category: "graph_validation_or_unknown_node", code: "executor.node.definition_version_unavailable", retryable: false, stage: "dispatch", effect: "unacted" } }, options, beforeAction, hostCapabilities, runState);
    }
    // A Call Subflow runs its sibling graph as a frame of this run, never through a host (`../frames/call-subflow.ts`).
    if (node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID) {
      const runSubflow = options.invocation?.run.runSubflow;
      if (options.commandRun && (!runSubflow || !options.commandRun.acceptsComposite(runSubflow))) {
        await options.commandRun.stop("executor.unsupported_native_or_composite");
        throw new Error("executor.unsupported_native_or_composite");
      }
      // Its `inputs` were resolved above, as every parameter is: each holds the value it gives the child.
      runState.dispatchedActions.add(node.id);
      const called = await automationStudioCallSubflow({ node: executionNode, options: this.callFlowChildOptions(options, attemptId) });
      return await this.finishAttempt(flow, executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, called.result), ...(called.childTrace ? { childTrace: called.childTrace } : {}), ...(called.subflowTarget ? { subflowTarget: called.subflowTarget } : {}) }, options, beforeAction, hostCapabilities, runState);
    }
    if (!definition?.execute) {
      if (!options.commandRun && options.nativeNodeExecutor) runState.dispatchedActions.add(node.id);
      const native = await (!options.commandRun ? options.nativeNodeExecutor?.({
        node: executionNode,
        // The run's own Flow inputs, then what an edge brings: a declared port is
        // never filled from a bare key another node left behind (`node-inputs.ts`).
        // Flow inputs come from `options.inputs`, not `values`, where a node's
        // bare output key could have overwritten them. The native runtime still
        // hands the implementation only its declared ports.
        inputs: { ...(options.inputs ?? {}), ...collectWiredNodeInputs(flow, node, values) },
        ...(options.signal ? { signal: options.signal } : {}),
        hostContext: {
          ...(options.referenceNow !== undefined ? { referenceNow: options.referenceNow } : {}),
          capabilityIds: hostCapabilities,
          sideEffectClass: automationStudioNodeSideEffectClass(executionNode, runState.actionEffects.get(node.id)),
          ...(beforeAction ? { currentStateRef: beforeAction, previousStateRef: beforeAction } : {}),
          ...(executionNode.parameterValues?.target !== undefined ? { target: executionNode.parameterValues.target } : {})
        }
      }) : undefined);
      if (native) {
        // An importer's definition is the native runtime's, so it says which routes the node declares.
        const target: RecordCaptureTarget = { runState, nodeId: node.id, attemptId, cleared: [], ...(consumer ? { consumer } : {}) };
        const result = await this.dispatchAutomationStudioEffects(native.result, options, withholding, target, definition?.outputs ?? native.declaredOutputs);
        return await this.finishAttempt(flow, executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...this.clearedLayersSaid(node.id, target), ...this.obstructionMet(target), ...(native.logs?.length ? { logs: native.logs } : {}) }, options, beforeAction, hostCapabilities, runState);
      }
      if (options.commandRun && (!options.compositeExecutor || !options.commandRun.acceptsComposite(options.compositeExecutor))) {
        await options.commandRun.stop("executor.unsupported_native_or_composite");
        throw new Error("executor.unsupported_native_or_composite");
      }
      if (options.compositeExecutor) runState.dispatchedActions.add(node.id);
      const composite = await options.compositeExecutor?.({ node: executionNode, inputs, options: this.callFlowChildOptions(options, attemptId) });
      if (composite) {
        return await this.finishAttempt(flow, executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) }, options, beforeAction, hostCapabilities, runState);
      }
      return await enrichAttemptWithHostState(executionNode, {
        attemptId,
        nodeId: node.id,
        definitionId: node.definitionId,
        startedAt,
        finishedAt: options.now?.() ?? Date.now(),
        status: "failed",
        route: "failed",
        inputs,
        outputs: {},
        effects: [],
        message: `Node definition is not executable: ${node.definitionId}.`,
        failure: { category: "graph_validation_or_unknown_node", code: "executor.node.not_executable", retryable: false, stage: "dispatch", effect: "unacted" }
      }, options, beforeAction, hostCapabilities, runState);
    }
    // The node asks the host whether expected state holds; Core names which node
    // and attempt asked, and which snapshot the question is about.
    const boundEvaluator = hostExpectationEvaluator(options.hostRuntime);
    const expectationEvaluator: AutomationNodeExpectationEvaluator | undefined = boundEvaluator
      ? (conditions, mode, timeoutMs, evaluationContext) => boundEvaluator(conditions, mode, timeoutMs, { ...evaluationContext, nodeId: node.id, attemptId, ...(beforeAction ? { stateRef: beforeAction.stateRef } : {}) })
      : undefined;
    try {
      const context = {
        inputs,
        parameters: resolvedParameters.values,
        // Run-scoped: one map for the whole run, so a write reaches the nodes after it.
        variables: runState.variables,
        iteration: this.iterationFor(runState, node.id),
        ...(options.random ? { random: options.random } : {}),
        ...(options.now ? { now: options.now } : {}),
        ...(options.referenceNow !== undefined ? { referenceNow: options.referenceNow } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(expectationEvaluator ? { expectationEvaluator } : {})
      };
      if (!this.trustedDefinitions.has(definition) || this.trustedDefinitions.get(definition) !== definition.execute) runState.dispatchedActions.add(node.id);
      let result = await definition.execute(context);
      const target: RecordCaptureTarget = { runState, nodeId: node.id, attemptId, cleared: [], ...(consumer ? { consumer } : {}) };
      result = await this.dispatchAutomationStudioEffects(result, options, withholding, target, definition.outputs);
      return await this.finishAttempt(flow, executionNode, { ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...this.clearedLayersSaid(node.id, target), ...this.obstructionMet(target) }, options, beforeAction, hostCapabilities, runState);
    } catch (error) {
      await options.commandRun?.stop("executor.attempt_failed");
      // The one place a node's throw becomes an attempt, and therefore the one
      // place a throw is classified. Before this, a throw produced a failed
      // attempt with no structured failure at all, and the retry loop -- which
      // asks the failure record whether the attempt may be repeated -- answered
      // no to every one of them. A provider that answered 503, a connection that
      // dropped, an answer that arrived truncated: each ended the run, and that
      // is what this catch exists to stop.
      return await enrichAttemptWithHostState(executionNode, automationStudioNodeAttemptFailure(node, error, options, attemptNumber, startedAt, inputs, runState.dispatchedActions.has(node.id)), options, beforeAction, hostCapabilities, runState);
    }
  }

  // Host state is captured first, so the expectation evaluator is asked about the
  // snapshot the attempt actually ended on. A lasting step judged by no expected
  // state is then held to its recorded effect (`./recorded-effect.ts`, t476),
  // unless the domain found the page already in the state it asks for and
  // pressed nothing (`./already-in-state.ts`, t775).
  private static async finishAttempt(
    flow: AutomationStudioFlowDocument,
    node: AutomationStudioFlowNode,
    attempt: AutomationStudioNodeAttemptTrace,
    options: AutomationStudioGraphExecutionOptions,
    beforeAction: AutomationStudioHostStateSnapshotRef | undefined,
    hostCapabilities: string[],
    runState: AutomationStudioRunState
  ): Promise<AutomationStudioNodeAttemptTrace> {
    const enriched = await enrichAttemptWithHostState(node, automationStudioAttemptAlreadyInState(attempt), options, beforeAction, hostCapabilities, runState);
    const judged = await attemptWithHostExpectationEvaluation(node, enriched, options);
    return await automationStudioAttemptWithRecordedEffect(flow, node, judged, options, runState.actionEffects.get(node.id));
  }

  /** The attempt a dispatch belongs to, and the run state its captured rows are recorded in. */

  /** The effect Write Records emits. It carries its rows, so no dispatcher is asked to handle it. */

  // The three dispatch paths -- the IO runtime, the framework runtime, and a
  // host's own dispatcher -- meet only here, so rows are captured here. A
  // `records.write` effect is captured here too, from the effect itself, with or
  // without a dispatcher.
  //
  // A successful dispatch may answer a route of its own (`../io-policy.ts`). It
  // is taken only when the node's definition declares a branch output of that
  // id, so a dispatch can choose among the routes its node was authored with and
  // never invent one, or send the run down a data port's edge; otherwise the
  // node's own route stands. A data output that names where in the answer its
  // value lies is filled from it (`./result-path-outputs.ts`).
  private static async dispatchAutomationStudioEffects(initial: AutomationNodeExecutionResult, options: AutomationStudioGraphExecutionOptions, withholding: AutomationStudioTraceWithholding, target: RecordCaptureTarget, declaredOutputs: readonly AutomationNodePort[] | undefined): Promise<AutomationNodeExecutionResult> {
    const branchRoutes = this.declaredBranchRoutes(declaredOutputs);
    let result = initial;
    for (const [index, effect] of (initial.effects ?? []).entries()) {
      await options.commandRun?.checkpoint();
      // A question for a person is the executor's to raise, not a domain's to
      // answer: no host dispatcher is asked to know what an ask is.
      if (effect.type === AUTOMATION_STUDIO_ASK_EFFECT) continue;
      let dispatched: AutomationNodeExecutionResult;
      let issued: { capability: object; context: ClientGatewayCommandContext } | undefined;
      if (effect.type === RECORDS_WRITE_EFFECT) {
        const written = await this.withWrittenRecords(effect, options, target);
        result = { ...result, effects: (result.effects ?? []).map((kept, position) => position === index ? written.effect : kept) };
        dispatched = written.result;
        if (options.commandRun && dispatched.failure?.code === "record_output.persist_failed") throw new Error("executor.required_capture_failed");
      } else {
        if (options.commandRun) {
          if (effect.type !== "policy.output.dispatch" || !target.consumer || !options.effectDispatcher) throw new Error("executor.unsupported_required_effect");
          issued = await options.commandRun.context(target.consumer, index);
        }
        if (!options.effectDispatcher) continue;
        if (options.signal?.aborted) throw new Error("Node execution was cancelled before dispatch.");
        // Native implementations may emit an output whose floor becomes known
        // only now. Raise the same execution-only entry before dispatch throws.
        if (effect.type === "policy.output.dispatch" && effect.payload && typeof effect.payload === "object" && !Array.isArray(effect.payload)) {
          const outputNode: AutomationStudioFlowNode = { id: target.nodeId, definitionId: "builtin.policy.action", parameterValues: effect.payload };
          const outputFloor = options.resolveActionEffect?.(outputNode, effect.payload);
          const combined = combineAutomationStudioResolvedActionEffects([target.runState.actionEffects.get(target.nodeId), outputFloor]);
          if (combined) target.runState.actionEffects.set(target.nodeId, combined);
        }
        const dispatchContext = this.effectDispatchContext(options, withholding);
        target.runState.dispatchedActions.add(target.nodeId);
        const answer = await options.effectDispatcher(effect, issued ? { ...dispatchContext, commandContext: issued.context } : dispatchContext);
        if (!answer) { if (issued) throw new Error("executor.required_result_missing"); continue; }
        // A check on the page that cleared by itself while this output waited is
        // told as the pair a tool call's would be; an absent or unreadable figure
        // says nothing.
        emitAutomationStudioActivityClearedWait(this.clearedWaitRef(options, target, index), answer.clearedWait, "running");
        // Layers the client closed over the page while this output ran are read
        // off the dispatch payload before records are captured from it.
        target.cleared?.push(...automationStudioClearedLayersOf(answer.outputs?.result));
        // So is the layer that stood over the page, which a failed dispatch
        // carries at the same place (`../../io-policy.ts` keeps the payload on a
        // failure as on a success): the interference rung presses its way out.
        const obstruction = automationStudioObstructionOf(answer.outputs?.result);
        if (obstruction) target.obstruction = obstruction;
        dispatched = await this.withCapturedRecords(effect, answer, options, target);
        // A required command that answered without a committed receipt either
        // never left -- nothing was claimed for it, so it is withdrawn and the
        // attempt fails as an act that did not happen, open to the usual retry --
        // or left its outcome unknown and latched the run: nothing is consumed,
        // the attempt fails with that fact, and the step loop stops there
        // (`../step-loop/uncertain-stop.ts`).
        if (issued && !options.commandRun!.receipted(issued.context)) {
          result = options.commandRun!.withdraw(issued.context) ? this.notSentResult(result, dispatched) : this.outcomeUnknownResult(result, dispatched);
          break;
        }
        if (issued && (dispatched.failure?.code === "record_output.persist_failed" || dispatched.status !== "success" && dispatched.status !== "failed")) throw new Error("executor.required_result_unhandled");
      }
      const outputs = { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) };
      // The attempt trace classifies from the dispatcher's target resolution,
      // failure record, and message, so they survive the merge.
      const targetResolution = dispatched.targetResolution ? { targetResolution: dispatched.targetResolution } : {};
      if (dispatched.status === "failed") {
        result = {
          ...result,
          outputs,
          status: "failed",
          route: dispatched.route ?? "failed",
          ...targetResolution,
          ...(dispatched.message ? { message: dispatched.message } : {}),
          ...(dispatched.failure ? { failure: dispatched.failure } : {})
        };
      } else {
        const route = dispatched.route && branchRoutes.has(dispatched.route) ? { route: dispatched.route } : {};
        result = { ...result, outputs: { ...outputs, ...automationStudioResultPathOutputs(outputs, declaredOutputs) }, ...targetResolution, ...route };
      }
      if (issued && target.consumer && options.commandRun) {
        const handled = this.handling.get(target.consumer) ?? new Map();
        handled.set(issued.capability, { context: issued.context, run: options.commandRun, witness: Object.freeze({}) });
        this.handling.set(target.consumer, handled);
        await options.commandRun.consume(target.consumer, issued.capability, issued.context);
      }
      if (dispatched.status === "failed") break;
    }
    return result;
  }

  /** A required attempt whose command never left: failed as unacted, with the dispatcher's record when it gave one. */
  private static notSentResult(result: AutomationNodeExecutionResult, dispatched: AutomationNodeExecutionResult): AutomationNodeExecutionResult {
    return {
      ...result,
      outputs: { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) },
      status: "failed",
      route: "failed",
      ...(dispatched.targetResolution ? { targetResolution: dispatched.targetResolution } : {}),
      message: dispatched.message ?? "The command was never sent, so the step did not happen.",
      failure: dispatched.failure ? { ...dispatched.failure, effect: "unacted" } : { ...AUTOMATION_STUDIO_REQUIRED_COMMAND_NOT_SENT }
    };
  }

  /** A required attempt whose command's outcome stayed unknown: failed with Core's record, keeping what the dispatcher said and saw. */
  private static outcomeUnknownResult(result: AutomationNodeExecutionResult, dispatched: AutomationNodeExecutionResult): AutomationNodeExecutionResult {
    return {
      ...result,
      outputs: { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) },
      status: "failed",
      route: "failed",
      ...(dispatched.targetResolution ? { targetResolution: dispatched.targetResolution } : {}),
      message: dispatched.message ?? "The command's answer never came, and its outcome is unknown.",
      failure: { ...AUTOMATION_STUDIO_REQUIRED_OUTCOME_UNKNOWN }
    };
  }

  /** The ids of the branch outputs a node's definition declares: the only routes a dispatch may answer for it. */
  private static declaredBranchRoutes(outputs: readonly AutomationNodePort[] | undefined): ReadonlySet<string> {
    return new Set((outputs ?? []).filter((port) => port.role === "branch").map((port) => port.id));
  }

  // The layers an attempt's dispatches closed are said once, as one step
  // recovery row about the node, and kept on the attempt trace. An attempt
  // that closed none carries no field and says nothing.
  private static clearedLayersSaid(nodeId: string, target: RecordCaptureTarget): Pick<AutomationStudioNodeAttemptTrace, "clearedLayers"> {
    const layers = target.cleared ?? [];
    if (layers.length === 0) return {};
    emitAutomationStudioActivityStepInterference({ nodeId, kinds: layers.map((layer) => layer.kind) });
    return { clearedLayers: layers };
  }

  /** The layer the attempt's dispatches said stood over the page, kept on the attempt trace; none reported, no field. */
  private static obstructionMet(target: RecordCaptureTarget): Pick<AutomationStudioNodeAttemptTrace, "obstruction"> {
    return target.obstruction ? { obstruction: target.obstruction } : {};
  }

  // One card per node attempt, keyed under the Call Flow attempts it runs inside
  // so a child's node never shares a ref with the parent's. A second dispatch in
  // the same attempt is numbered.
  private static clearedWaitRef(options: AutomationStudioGraphExecutionOptions, target: RecordCaptureTarget, effectIndex: number): string {
    const attempt = [...(options.callFlowAttemptPath ?? []), target.attemptId].join("/");
    return `waited-out.${attempt}${effectIndex > 0 ? `.${effectIndex}` : ""}`;
  }


  private static async withCapturedRecords(
    effect: { type: string; payload?: JsonValue },
    answer: AutomationNodeExecutionResult,
    options: AutomationStudioGraphExecutionOptions,
    target: RecordCaptureTarget
  ): Promise<AutomationNodeExecutionResult> {
    const { result, batch } = captureAutomationStudioRecordBatch({
      effect,
      dispatched: answer,
      nodeId: target.nodeId,
      attemptId: target.attemptId,
      callFlowAttemptPath: options.callFlowAttemptPath ?? []
    });
    return await this.withStoredBatch(result, batch, options, target, PERSIST_FAILED_MESSAGE);
  }

  private static async withWrittenRecords(
    effect: { type: string; payload?: JsonValue },
    options: AutomationStudioGraphExecutionOptions,
    target: RecordCaptureTarget
  ): Promise<{ result: AutomationNodeExecutionResult; effect: { type: string; payload?: JsonValue } }> {
    const written = captureAutomationStudioWrittenRecords({
      effect,
      nodeId: target.nodeId,
      attemptId: target.attemptId,
      callFlowAttemptPath: options.callFlowAttemptPath ?? []
    });
    return { result: await this.withStoredBatch(written.result, written.batch, options, target, WRITE_PERSIST_FAILED_MESSAGE), effect: written.effect };
  }

  // The rows are recorded in the run state whether or not the hook stores them,
  // so the saved trace holds markers for them either way. A hook that throws
  // fails the attempt: rows the Flow declared must be saved are not dropped
  // silently. Its error text is not copied into the trace, which keeps no row.
  private static async withStoredBatch(
    result: AutomationNodeExecutionResult,
    batch: AutomationStudioRecordBatch | undefined,
    options: AutomationStudioGraphExecutionOptions,
    target: RecordCaptureTarget,
    persistFailedMessage: string
  ): Promise<AutomationNodeExecutionResult> {
    if (!batch) return result;
    let stored: AutomationStudioRunDatasetSummary | undefined;
    try {
      stored = await options.onRecordBatch?.(batch);
    } catch {
      target.runState.records.record(batch);
      return { ...result, status: "failed", route: "failed", message: persistFailedMessage, failure: { category: "action_failed", code: "record_output.persist_failed", retryable: false } };
    }
    target.runState.records.record(batch, stored);
    if (stored) emitAutomationStudioActivity({ phase: "extracting", label: `Saved ${batch.rows.length} ${batch.rows.length === 1 ? "record" : "records"}`, detail: { kind: "step", title: "Records saved", status: "succeeded", ref: batch.nodeId } });
    return result;
  }

  // A node keeps its place between passes under its own id, for as long as this
  // run executes.
  private static iterationFor(runState: AutomationStudioRunState, nodeId: string): NonNullable<AutomationNodeExecutionContext["iteration"]> {
    return {
      get: () => runState.loops.get(nodeId),
      set: (state) => {
        if (state) runState.loops.set(nodeId, state);
        else runState.loops.delete(nodeId);
      }
    };
  }

  // The child run a Call Flow attempt starts keys its record batches under this
  // attempt, so they never share a key with the parent's or with another
  // invocation's.
  /** A child Flow numbers its own attempts from one: the parent's prior count describes the parent's run, not the child's. */
  private static callFlowChildOptions(options: AutomationStudioGraphExecutionOptions, attemptId: string): AutomationStudioGraphExecutionOptions {
    const { priorAttemptCount: _parentPriorAttemptCount, ...childBase } = options;
    return { ...childBase, callFlowAttemptPath: [...(options.callFlowAttemptPath ?? []), attemptId] };
  }


  // What the run has resolved out of state travels with each dispatch, so a
  // dispatcher that saves its own record of the command -- the framework
  // runtime's command attempt -- withholds the values the trace withholds. A dispatch with
  // neither a reference, signal nor a withheld value gets no context, as before.
  private static effectDispatchContext(options: AutomationStudioGraphExecutionOptions, withholding: AutomationStudioTraceWithholding): EffectDispatchContext {
    const withheldValues = withholding.values();
    const withholds = withheldValues.texts.length > 0 || withheldValues.numbers.length > 0;
    if (options.referenceNow === undefined && !options.signal && !withholds) return undefined;
    return { ...(options.referenceNow !== undefined ? { referenceNow: options.referenceNow } : {}), ...(options.signal ? { signal: options.signal } : {}), ...(withholds ? { withheldValues } : {}) };
  }
}
