import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import {
  automationStudioLlmRerunCapture,
  automationStudioLlmRerunExecution,
  createAutomationStudioLlmRerunProvenance,
  type AutomationStudioLlmRerunCaptureSnapshot,
  type AutomationStudioLlmRerunExecutor,
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

  const producer: AutomationStudioLlmRerunExecutor = async (request) => {
    const forwarded: AutomationStudioLlmRerunRequest = { callId: request.callId, toolId: request.toolId, value: structuredClone(request.value) };
    if (request.referenceNow !== undefined) forwarded.referenceNow = request.referenceNow;
    requests.push(forwarded);
    const access = automationStudioLlmRerunExecution({ owner, generation, value: request.value });
    if (access.kind === "refused") return refused();
    if (access.kind === "selected") {
      if (access.capsule !== capsule || access.consume(capsule).kind !== "consumed") return refused();
      frozen++;
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
    requests, snapshot, publish, producer, request, seal,
    get normal() { return normal; },
    get frozen() { return frozen; },
    get current() { return current; },
    set current(next: AutomationStudioLlmRerunScope | undefined) { current = next; }
  };
}
