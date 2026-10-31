import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionDeclaration } from "../../../action-permissions/index.ts";
import {
  automationStudioLlmRerunCapture,
  automationStudioLlmRerunExecution,
  createAutomationStudioLlmRerunProvenance,
  type AutomationStudioLlmRerunCaptureSnapshot,
  type AutomationStudioLlmRerunExecutor,
  type AutomationStudioLlmRerunExecutionAccess,
  type AutomationStudioLlmRerunRecord,
  type AutomationStudioLlmRerunRequest,
  type AutomationStudioLlmRerunScope
} from "../index.ts";

export function success(resultCode?: string): AutomationStudioLlmEvidenceToolExecutionResult {
  const result: AutomationStudioLlmEvidenceToolExecutionResult = {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: true, shelves: 3 },
    effectApplied: false
  };
  if (resultCode !== undefined) result.resultCode = resultCode;
  return result;
}

export function refused(): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "unavailable" }, effectApplied: false };
}

export function scope(): AutomationStudioLlmRerunScope {
  return { loop: {}, binding: {}, generation: {}, registry: {}, authority: {} };
}

export function fixture() {
  let current: AutomationStudioLlmRerunScope | undefined = scope();
  const provenance = createAutomationStudioLlmRerunProvenance({ currentScope: () => current });
  const owner = {};
  const generation = {};
  const capsule = Object.freeze({ privatePayload: "private-command-payload" });
  const subject = Object.freeze({ privateSubject: "private-semantic-subject" });
  const attempt = {};
  const receipt = {};
  const value: JsonObject = { node: "shelves", parameters: { target: "t1" } };
  const parameters: JsonObject = { selector: "#private-shelf", columns: ["stock"] };
  const effectiveInputs: JsonObject = { context: { aisle: "private-aisle" } };
  const requests: AutomationStudioLlmRerunRequest[] = [];
  let normal = 0;
  let frozen = 0;

  function snapshot(overrides: Partial<AutomationStudioLlmRerunCaptureSnapshot> = {}): AutomationStudioLlmRerunCaptureSnapshot {
    return {
      owner,
      generation,
      definitionId: "warehouse.shelves",
      definitionVersion: "1.0.0",
      parameters,
      effectiveInputs,
      adapterValue: value,
      referenceNow: 123456,
      subject,
      capsule,
      dispatch: { attempts: [{ identity: attempt, receipt, outcome: "succeeded" }], selected: attempt },
      ...overrides
    };
  }

  function publish(input: AutomationStudioLlmRerunCaptureSnapshot) {
    const sink = automationStudioLlmRerunCapture();
    if (sink.kind !== "capture") throw new Error(`test capture unavailable: ${sink.reason}`);
    return sink.publish(input);
  }

  async function assess(request: AutomationStudioLlmRerunRequest, declaration: Omit<Partial<AutomationStudioActionDeclaration>, "actionEffect"> & { actionEffect?: AutomationStudioActionDeclaration["actionEffect"] } = {}) {
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false });
    const { actionEffect, ...changes } = declaration;
    const action: AutomationStudioActionDeclaration = {
      consequences: [], control: { name: "Read inventory", kind: "list" }, verb: "read", effect: "observe",
      actionEffect: { effectClass: "observe", permissionConsequences: [] }, ...changes
    };
    if (Object.hasOwn(declaration, "actionEffect")) {
      if (actionEffect === undefined) delete action.actionEffect;
      else action.actionEffect = actionEffect;
    }
    return await gate.checkFor({ kind: "exploration_step", id: request.toolId, ref: request.callId })(action);
  }

  function report(access: Extract<AutomationStudioLlmRerunExecutionAccess, { kind: "selected" }>, outcome: "succeeded" | "failed_unacted" | "uncertain" | "unknown" = "succeeded") {
    if (!access.reportDispatch) throw new Error("test fresh dispatch reporting unavailable");
    const identity = {};
    const fresh = { attempts: [{ identity, receipt: {}, outcome }], selected: identity };
    return access.reportDispatch(access.capsule, fresh);
  }

  const producer: AutomationStudioLlmRerunExecutor = async (request) => {
    const forwarded: AutomationStudioLlmRerunRequest = { callId: request.callId, toolId: request.toolId, value: structuredClone(request.value) };
    if (request.referenceNow !== undefined) forwarded.referenceNow = request.referenceNow;
    requests.push(forwarded);
    if (!(await assess(request)).permitted) return refused();
    const access = automationStudioLlmRerunExecution({ owner, generation, value: request.value });
    if (access.kind === "refused") return refused();
    if (access.kind === "selected") {
      if (access.capsule !== capsule || access.consume(capsule).kind !== "consumed") return refused();
      frozen++;
      report(access);
      return success("warehouse.shelves.read");
    }
    normal++;
    publish(snapshot({ adapterValue: request.value }));
    return success("warehouse.shelves.read");
  };

  function request(callId: string): AutomationStudioLlmRerunRequest {
    return { callId, toolId: "core.run_node", value };
  }

  async function seal(callId = "original", executor: AutomationStudioLlmRerunExecutor = producer): Promise<AutomationStudioLlmRerunRecord> {
    await provenance.capture(request(callId), executor);
    const found = provenance.lookup(callId);
    if (found.kind !== "available") throw new Error(`test original unavailable: ${found.reason}`);
    return found.record;
  }

  return {
    provenance, owner, generation, capsule, subject, attempt, receipt, value, parameters, effectiveInputs,
    requests, snapshot, publish, assess, report, producer, request, seal,
    get normal() { return normal; },
    get frozen() { return frozen; },
    get current() { return current; },
    set current(next: AutomationStudioLlmRerunScope | undefined) { current = next; }
  };
}
