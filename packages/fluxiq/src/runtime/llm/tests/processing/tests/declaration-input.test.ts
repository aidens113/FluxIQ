import { expect, it } from "vitest";
import { automationStudioLlmEvidenceDecisionIssueCodes, automationStudioLlmEvidenceParseDecision } from "../../../evidence-loop-decision.ts";

const CODE = "record_output.process_declaration_framework_owned";
it("refuses any model-authored processing stamp on run/write at the documented record-output locations", () => {
  for (const declaration of [null, {}, { version: 1, source: "a".repeat(64), revision: 1, bindings: {} }]) for (const write of [false, true]) for (const direct of [false, true]) {
    const config = { recordOutput: { process: { declaration } } };
    const decision = { kind: "tool_call", callId: "call", toolId: "core.run_node", input: { node: "fixture.read", ...(direct ? config : { parameters: config }), ...(write ? { write: true } : {}) } };
    expect(automationStudioLlmEvidenceParseDecision(decision)).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionIssueCodes(decision)).toEqual([CODE]);
  }
});

it("refuses an authored amendment stamp with a repairable reason, including bare bind parameters and settings", () => {
  const stamp = { recordOutput: { process: { declaration: { version: 1 } } } };
  for (const amendment of [{ step: 1, change: "rerun", input: { parameters: stamp } }, { step: 1, change: "bind", input: stamp }, { step: 1, change: "keep", settings: stamp }]) {
    const decision = { kind: "amend_draft", amendments: [{ step: 2, change: "drop" }, amendment] };
    expect(automationStudioLlmEvidenceParseDecision(decision)).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionIssueCodes(decision)).toEqual([CODE]);
  }
});

it("keeps normal criteria and unrelated row fields named declaration as ordinary data", () => {
  const decision = { kind: "tool_call", callId: "call", toolId: "core.run_node", input: { node: "fixture.read", parameters: { recordOutput: { process: { columns: ["declaration"] } }, records: [{ declaration: "A", recordOutput: { process: { declaration: "row data" } } }] } } };
  expect(automationStudioLlmEvidenceParseDecision(decision)).toMatchObject({ kind: "tool_call", input: decision.input });
  expect(automationStudioLlmEvidenceDecisionIssueCodes(decision)).toBeUndefined();
  expect(automationStudioLlmEvidenceParseDecision({ ...decision, toolId: "fixture.inspect", input: { recordOutput: { process: { declaration: "unrelated tool data" } } } })).toBeDefined();
});

it("refuses raw processing state before translation while permitting explicit input value forms", () => {
  for (const write of [false, true]) {
    const decision = { kind: "tool_call", callId: "call", toolId: "core.run_node", input: { node: "fixture.read", parameters: { recordOutput: { process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } } }] } } }, ...(write ? { write: true } : {}) } };
    expect(automationStudioLlmEvidenceParseDecision(decision)).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionIssueCodes(decision)).toEqual(["record_output.process_input_binding_required"]);
  }
  const written = { kind: "tool_call", callId: "call", toolId: "core.run_node", input: { node: "fixture.read", write: true, parameters: { recordOutput: { process: { where: [{ field: "date", atMost: { $input: "latest", test: "2030-01-02" } }] } } } } };
  expect(automationStudioLlmEvidenceParseDecision(written)).toMatchObject({ kind: "tool_call", input: { parameters: { recordOutput: { process: { where: [{ atMost: { $state: { path: "latest", fallback: "2030-01-02" } } }] } } } } });
});
