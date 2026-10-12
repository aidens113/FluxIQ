// Fixtures for the entry, checkpoint-route, success-check and count tests
// (unit D2): a host that answers named facts beside the wiring page's own,
// a dispatcher that fails a step a set number of times, the chat rows a run
// emitted, and a framed root run whose holder a test can read.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import type { AutomationStudioFactEvaluationContext, AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { edge } from "./lifecycle-fixtures.ts";
import { line, page, pageOptions, press, type Page } from "./wiring-fixtures.ts";

/** What a named fact answers, given what the host was told about the run. */
export type FactAnswer = (fact: string, context: AutomationStudioFactEvaluationContext) => "true" | "false" | "unknown";

/** A host whose `popup` and `cleared` read `current`, and whose other facts `answer` decides; every batch lands on `current.factBatches`. */
export function factHost(current: Page, answer: FactAnswer = () => "unknown"): AutomationStudioHostRuntimeBoundary {
  return {
    capabilities: ["fact-evaluation"],
    factEvaluator: (conditions, context) => {
      current.factBatches.push([...conditions]);
      return conditions.map((condition) => ({ result: pageAnswer(current, condition.fact) ?? answer(condition.fact, context), evidence: { fact: condition.fact }, capturedAt: 1_000 }));
    }
  };
}

function pageAnswer(current: Page, name: string): "true" | "false" | undefined {
  if (name === "popup") return current.popup ? "true" : "false";
  if (name === "cleared") return current.popup ? "false" : "true";
  return undefined;
}

/** The dispatcher `options` has, with `elementId` failing, unacted and not retryable, its first `times` presses. */
export function failingFirst(options: AutomationStudioGraphExecutionOptions, elementId: string, times: number, retryable = false): void {
  const dispatch = options.effectDispatcher!;
  let failed = 0;
  options.effectDispatcher = (effect, context) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    if (id !== elementId || failed >= times) return dispatch(effect, context);
    failed += 1;
    return { status: "failed", route: "failed", message: `${elementId} did not work this time.`, failure: { category: "unexpected_state", code: "web.step.refused", retryable, stage: "execution", effect: "unacted" } };
  };
}

/** The dispatcher `options` has, with `elementId`'s press answering `outputs`. */
export function answering(options: AutomationStudioGraphExecutionOptions, elementId: string, outputs: JsonObject): void {
  const dispatch = options.effectDispatcher!;
  options.effectDispatcher = async (effect, context) => {
    const result = await dispatch(effect, context);
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    return id === elementId && result?.status === "success" ? { ...result, outputs: { ...(result.outputs ?? {}), ...outputs } } : result;
  };
}

/** A pressing step whose act lasts: dispatching it again could act a second time (`defensive/lasting-act.ts`). */
export function lasting(id: string): AutomationStudioFlowNode {
  return press(id, id, { declaredConsequences: ["places the order"] });
}

/** A pressing step that is a checkpoint `checkpointId`, with `when` conditions. */
export function checkpoint(id: string, checkpointId: string, when: JsonObject[] = []): AutomationStudioFlowNode {
  return press(id, id, { "fluxiq.checkpoint": { id: checkpointId, when, requires: [] } });
}

/** Runs `flow` as a framed root of Subflow `main`, so the test can read the run holder after. */
export async function framedRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions) {
  const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main", ...(options.inputs ? { inputs: options.inputs } : {}) }, (target, childOptions, onExecuted) => runAutomationStudioGraph(target.graph, childOptions, onExecuted));
  const trace = await runAutomationStudioGraph(flow, { ...options, invocation });
  return { trace, invocation };
}

/** Runs `run` in a run's activity scope, and returns its result with every row it emitted. */
export async function withRows<T>(run: () => Promise<T>): Promise<{ result: T; rows: ClientGatewayActivity[] }> {
  const rows: ClientGatewayActivity[] = [];
  const unsubscribe = automationStudioActivityHub.subscribe((row) => rows.push(row));
  try {
    const result = await runWithAutomationStudioActivity({ kind: "run", id: "run.d2", projectId: "project.d2" }, run);
    return { result, rows };
  } finally {
    unsubscribe();
  }
}

/** The recovery rows a run emitted, as `[kind, outcome, targetId]`. */
export function recoveryRows(rows: readonly ClientGatewayActivity[]): Array<[string, string, string | undefined]> {
  return rows.flatMap((row) => {
    const recovery = row.detail?.kind === "step" ? row.detail.recovery : undefined;
    return recovery ? [[recovery.kind, recovery.outcome, recovery.targetId] as [string, string, string | undefined]] : [];
  });
}

/** A Flow with no Handlers where s1 fails once and is retried, s2 fails and takes its failed edge to `fallback`, and `fallback` fails with nowhere to go. */
export function retryPlannedTrue() {
  const current = page({ failing: { s2: { retryable: false }, fallback: { retryable: false } } });
  const parts = [{ nodes: [press("fallback", "fallback", { onFailure: "stop" }), { id: "fallback.end", definitionId: "builtin.control.end" }], edges: [edge("s2", "fallback", "failed"), edge("fallback", "fallback.end")] }];
  const flow = line("graph.main", [press("s1"), press("s2")], parts);
  const options = pageOptions(current);
  failingFirst(options, "s1", 1, true);
  return { current, flow, options };
}
