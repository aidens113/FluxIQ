import { vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioLlmRerunCapture, automationStudioLlmRerunExecution, type AutomationStudioLlmRerunCaptureSnapshot } from "../../rerun-provenance/index.ts";
import * as provenance from "../../rerun-provenance/index.ts";
import type { AutomationStudioLlmPriorNodesAuthority } from "../index.ts";
import { AutomationStudioActionPermissionGate } from "../../../action-permissions/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../nodes/index.ts";

export const readCall = (callId: string, item = "one", node = "catalogue.read") => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters: { item, extraction: "visible-handle" }, consequences: [] } });
export const batchCall = (calls: string[], callId = "batch") => ({ kind: "tool_call", callId, toolId: "core.run_nodes", input: { calls } });
export const complete = { kind: "complete", result: { done: true } };

/** Observe actual private outcomes without replacing D0's implementation or receipt rules. */
export function observeMemberOutcomes() {
  const create = provenance.createAutomationStudioLlmRerunProvenance;
  const outcomes: provenance.AutomationStudioLlmRerunOutcome[] = [];
  const observed = vi.spyOn(provenance, "createAutomationStudioLlmRerunProvenance").mockImplementation((input) => {
    const original = create(input);
    const wrapped: ReturnType<typeof create> = { ...original, execute: async (record, request) => {
      const outcome = await original.execute(record, request);
      outcomes.push(outcome);
      return outcome;
    } };
    return wrapped;
  });
  return { outcomes, restore: () => observed.mockRestore() };
}

/** Actual trusted adapter protocol, with private resolved inputs absent from every public request. */
export function priorNodesFixture(options: {
  capture?: boolean;
  outerRefusal?: boolean;
  effect?: "observe" | "state";
  assess?: false;
  observedEffect?: AutomationStudioResolvedActionEffect;
  memberEffect?: AutomationStudioResolvedActionEffect;
  memberAssess?: false;
  afterReceiptEffect?: AutomationStudioResolvedActionEffect;
  auxiliaryBeforeMember?: boolean;
  permittedConsequences?: readonly string[];
  report?: false;
  skipMain?: boolean;
  dispatchOutcome?: "succeeded" | "failed_unacted" | "uncertain";
  before?(call: number, member: boolean): void;
  memberResult?(index: number, normal: AutomationStudioLlmEvidenceToolExecutionResult): AutomationStudioLlmEvidenceToolExecutionResult;
} = {}) {
  const owner = {}, generation = {}, loopBinding = {}, registry = {};
  const authority = new AutomationStudioActionPermissionGate({ stage: "authoring", instructed: [], endsOnRequest: false, permittedConsequences: options.permittedConsequences ?? ["create_new", "modify_existing", "delete", "move_money", "send_or_publish"] });
  let binding = loopBinding, members = 0, calls = 0, committed = false;
  const subjects = new Map<string, object>();
  const capsules = new WeakMap<object, { item: string }>();
  const publicRequests: JsonObject[] = [];
  const actualItems: string[] = [];
  const auxiliaryReads: string[] = [];
  const tools: AutomationStudioLlmEvidenceLoopInput["tools"] = [{
    toolId: "core.run_node", description: "Run a registered catalogue node.", effect: "mutate", perCallEffect: true, actionInputKey: "node",
    inputSchema: { type: "object", properties: { node: { enum: ["catalogue.read"] }, parameters: { type: "object" } } }
  }];
  const registeredEffect = (): AutomationStudioResolvedActionEffect => ({ effectClass: committed ? "commit" : options.effect ?? "observe", permissionConsequences: [], ...(options.effect === "state" && !committed ? { repeatSafe: true } : {}) });
  const port: AutomationStudioLlmPriorNodesAuthority = {
    currentScope: () => ({ binding, generation, registry, authority }),
    resolve: () => ({ definitionId: "catalogue.read", definitionVersion: "1.0.0", effect: registeredEffect() })
  };
  const executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async (call) => {
    publicRequests.push(structuredClone(call.value));
    const selected = automationStudioLlmRerunExecution({ owner, generation, value: call.value });
    const member = selected.kind === "selected";
    options.before?.(++calls, member);
    const refusal = (code: string): AutomationStudioLlmEvidenceToolExecutionResult => ({
      kind: "llm_evidence_tool_execution", evidence: { ok: false, code, auxiliary: [...auxiliaryReads] }, effectApplied: false, resultCode: code
    });
    if (member && options.auxiliaryBeforeMember) {
      const auxiliary = await authority.checkFor({ kind: "flow_step", id: "aux.inspect", ref: `${call.callId}.auxiliary` })({
        consequences: [], actionEffect: { effectClass: "observe", permissionConsequences: [] }, effect: "observe", control: { name: "Guard facts", kind: "region" }, verb: "read"
      });
      if (!auxiliary.permitted) return refusal("catalogue.auxiliary.held");
      auxiliaryReads.push("guard-read");
    }
    if (options.assess !== false && (!member || options.memberAssess !== false)) {
      const floor = (member ? options.memberEffect : undefined) ?? options.observedEffect ?? registeredEffect();
      const verdict = await authority.checkFor({ kind: "exploration_step", id: call.toolId, ref: call.callId })({
        consequences: [], actionEffect: floor, effect: floor.effectClass === "observe" ? "observe" : "mutate", control: { name: "Catalogue", kind: "region" }, verb: "read"
      });
      if (!verdict.permitted) return refusal("catalogue.permission.held");
    }
    if (selected.kind === "refused") throw new Error("private adapter refusal");
    let item = String((call.value.parameters as JsonObject | undefined)?.item ?? "one");
    let publish: ((dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"]) => void) | undefined;
    if (selected.kind === "selected") {
      const payload = capsules.get(selected.capsule);
      if (!payload || selected.consume(selected.capsule).kind !== "consumed") return refusal("catalogue.capsule.held");
      item = payload.item;
      members += 1;
    } else if (options.capture !== false) {
      const subject = subjects.get(item) ?? {};
      subjects.set(item, subject);
      const capsule = {};
      capsules.set(capsule, { item });
      publish = (dispatch) => {
        const sink = automationStudioLlmRerunCapture();
        if (sink.kind === "capture") sink.publish({
          owner, generation, subject, capsule, definitionId: "catalogue.read", definitionVersion: "1.0.0",
          parameters: { item, query: "private-resolved-query" }, effectiveInputs: {}, adapterValue: call.value, referenceNow: call.referenceNow ?? 99, dispatch
        });
      };
    }
    if (!member || !options.skipMain) {
      actualItems.push(item);
      const attempt = {}, receipt = { item, privateReceipt: "private-producer-receipt" };
      const dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] = { attempts: [{ identity: attempt, receipt, outcome: member ? options.dispatchOutcome ?? "succeeded" : "succeeded" }], selected: attempt };
      if (selected.kind === "selected" && options.report !== false) {
        if (selected.reportDispatch?.(selected.capsule, dispatch).kind !== "accepted") throw new Error("Fresh main receipt report refused.");
      } else publish?.(dispatch);
    }
    if (member && options.afterReceiptEffect) {
      const floor = options.afterReceiptEffect;
      const checked = await authority.checkFor({ kind: "flow_step", id: "aux.after", ref: `${call.callId}.after` })({
        consequences: [], actionEffect: floor, effect: floor.effectClass === "observe" ? "observe" : "mutate", control: { name: "Follow-up facts", kind: "region" }, verb: "read"
      });
      if (!checked.permitted) return refusal("catalogue.after.held");
    }
    const stateful = options.effect === "state";
    const normal: AutomationStudioLlmEvidenceToolExecutionResult = {
      kind: "llm_evidence_tool_execution", evidence: { ok: true, item, observation: calls }, effectApplied: stateful, resultCode: "catalogue.read.done",
      stateDigests: stateful ? { before: `world.${calls - 1}`, after: `world.${calls}` } : { before: "world", after: "world" },
      draft: { actionId: "catalogue.read", effect: stateful ? "mutate" : "observe", proposes: stateful, input: call.value, ranWith: { node: "catalogue.read", parameters: { extraction: "restored-handle" } } }
    };
    if (options.outerRefusal) return { ...normal, evidence: { ok: false, code: "outer.refused" } };
    return member && options.memberResult ? options.memberResult(members, normal) : normal;
  };
  return {
    tools, port, executeTool, publicRequests, actualItems, auxiliaryReads, authority,
    replaceBinding() { binding = {}; },
    commitEffect() { committed = true; },
    run(decisions: unknown[], overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) {
      let index = 0;
      const maxIterations = overrides.maxIterations ?? 20;
      const decide = vi.fn(async (_request: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => decisions[index++] ?? complete);
      const result = runAutomationStudioLlmEvidenceLoop({ tools, executeTool, rerunAuthority: port, decide, maxIterations, maxToolCalls: 30, maxStepsWithoutProgress: Math.min(24, maxIterations), draft: false, dryRun: false, ...overrides });
      return { result, decide };
    }
  };
}
