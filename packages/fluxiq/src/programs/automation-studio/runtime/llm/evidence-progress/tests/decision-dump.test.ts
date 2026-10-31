// The decision dump writes a build's decisions, tool calls and checks in full,
// only where it is pointed, and never through the trace's log.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDecisionDump, automationStudioLlmEvidenceLoopProgressTrace, automationStudioLlmEvidenceToolExecutionControl } from "../index.ts";

const PAGE_TEXT = "Voltbay USB-C hub, 7-in-1, Space Grey";

function loopInput() {
  return {
    decide: async (_input: { iteration: number; evidence: unknown[] }) => ({ kind: "tool_call", toolCall: { callId: "c2", toolId: "core.run_node", value: { node: "web.output.dom-click" } } }),
    executeTool: async (_input: { callId: string; toolId: string; value: { node: string } }) => ({ resultCode: "web.action.succeeded", evidence: PAGE_TEXT }),
    checkCompletion: async (_result: { summary: string }, _context: { steps: string[] }) => ({ ok: false, issueCodes: ["bootstrap.instructed_act_missing"], feedback: { missingActs: { acts: [{ id: "a1.colour", reason: "no_step_named" }] } } })
  };
}

const made: string[] = [];
function directory(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fluxiq-decision-dump-"));
  made.push(dir);
  return dir;
}
function records(dir: string): Array<Record<string, unknown>> {
  const files = readdirSync(dir);
  expect(files).toHaveLength(1);
  return readFileSync(path.join(dir, files[0]!), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the build's decision dump", () => {
  it("is off without an absolute directory, and then leaves the loop's input untouched", () => {
    expect(automationStudioLlmEvidenceDecisionDump({})).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionDump({ FLUXIQ_BUILD_DECISION_DUMP: "relative/dir" })).toBeUndefined();
    const input = loopInput();
    expect(automationStudioLlmEvidenceLoopProgressTrace(input, {})).toBe(input);
  });

  it("writes each shown entry once, each decision with its window's keys, each tool call and each check in full", async () => {
    const dir = directory();
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_DECISION_DUMP: dir }, (line) => lines.push(line));
    const look = { callId: "c1", toolId: "core.run_node", value: { page: PAGE_TEXT } };
    const draft = { callId: "core.flow_draft", toolId: "core.flow_draft", value: { steps: 1 } };
    await traced.decide({ iteration: 1, evidence: [look] });
    await traced.executeTool({ callId: "c2", toolId: "core.run_node", value: { node: "web.output.dom-click" } });
    await traced.decide({ iteration: 2, evidence: [look, draft] });
    await traced.checkCompletion({ summary: "done" }, { steps: [] });

    const written = records(dir);
    expect(written.map((record) => record.event)).toEqual(["entry", "decision", "tool", "entry", "decision", "check"]);
    const [lookEntry, first, tool, draftEntry, second, check] = written;
    expect(lookEntry!.entry).toEqual(look);
    expect(first).toMatchObject({ iteration: 1, shown: [lookEntry!.key], decision: { kind: "tool_call" } });
    expect(tool).toMatchObject({ callId: "c2", request: { value: { node: "web.output.dom-click" } }, result: { resultCode: "web.action.succeeded", evidence: PAGE_TEXT } });
    expect(draftEntry!.entry).toEqual(draft);
    expect(second).toMatchObject({ iteration: 2, shown: [lookEntry!.key, draftEntry!.key] });
    expect(check).toMatchObject({ verdict: { ok: false, feedback: { missingActs: { acts: [{ id: "a1.colour", reason: "no_step_named" }] } } } });
    // The dump alone does not switch the log on, and the log never carries the page.
    expect(lines).toEqual([]);
  });

  it("keeps the content-free trace as it was when both are on", async () => {
    const dir = directory();
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_PROGRESS_TRACE: "1", FLUXIQ_BUILD_DECISION_DUMP: dir }, (line) => lines.push(line));
    await traced.executeTool({ callId: "c2", toolId: "core.run_node", value: { node: "web.output.dom-click" } });
    expect(lines.map((line) => line.replace(/^\[FluxIQ build-trace\] \S+ /u, "").replace(/ms=\d+/u, "ms=N"))).toEqual([
      "loop start",
      "tool start callId=c2 toolId=core.run_node",
      "tool end toolId=core.run_node ms=N resultCode=web.action.succeeded"
    ]);
    expect(lines.join("\n")).not.toContain("Voltbay");
    expect(records(dir).map((record) => record.event)).toEqual(["tool"]);
  });

  it("projects private failure fields before both raw dumping and step logging, retaining actual call facts", async () => {
    const dir = directory(), steps = directory();
    const failure = Object.freeze({ category: "action_failed", code: "service.capacity", retryable: true, effect: "unacted", transient: true, expected: "PRIVATE_FAILURE_EXPECTED", actual: "PRIVATE_FAILURE_ACTUAL", evidenceDigest: "a".repeat(64) });
    const evidence = { ok: false, rows: [{ label: "public execution evidence" }] };
    const original = Object.freeze({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false, resultCode: "service.declined", resultReason: "capacity", personNeeded: true, failure });
    const traced = automationStudioLlmEvidenceLoopProgressTrace({ ...loopInput(), executeTool: async (_input: { callId: string; toolId: string; value: { node: string } }) => original }, { FLUXIQ_BUILD_DECISION_DUMP: dir, FLUXIQ_LLM_STEP_LOG_DIR: steps });
    const result = await traced.executeTool({ callId: "c2", toolId: "core.run_node", value: { node: "fixture.action" } });
    expect(result).not.toBe(original);
    expect(result.evidence).toBe(evidence);
    expect(result).toMatchObject({ effectApplied: false, personNeeded: true, failure: { category: "action_failed", code: "service.capacity", retryable: true, effect: "unacted", transient: true } });
    expect(Object.keys(result.failure)).toEqual(["category", "code", "retryable", "effect", "transient"]);
    expect(original.failure).toBe(failure);
    expect(original.failure.expected).toBe("PRIVATE_FAILURE_EXPECTED");
    const [tool] = records(dir);
    expect(tool).toMatchObject({ request: { callId: "c2", value: { node: "fixture.action" } }, result: { evidence, effectApplied: false, personNeeded: true } });
    const folder = path.join(steps, readdirSync(steps).find((name) => name.includes("-tool-"))!);
    expect(JSON.parse(readFileSync(path.join(folder, "result.json"), "utf8"))).toEqual(evidence);
    expect(JSON.parse(readFileSync(path.join(folder, "meta.json"), "utf8"))).toMatchObject({ effectApplied: false, loopVerdict: "read" });
    const serialized = JSON.stringify(tool) + readdirSync(folder).map((name) => readFileSync(path.join(folder, name), "utf8")).join("");
    for (const privateValue of ["PRIVATE_FAILURE_EXPECTED", "PRIVATE_FAILURE_ACTUAL", "a".repeat(64)]) expect(serialized).not.toContain(privateValue);
  });

  it("drops malformed or accessor failure metadata alone without invoking the failure getter", async () => {
    const dir = directory(), steps = directory();
    let reads = 0;
    const original = Object.defineProperty({ kind: "llm_evidence_tool_execution", evidence: { ok: false, retained: "execution evidence" }, effectApplied: true }, "failure", {
      enumerable: true,
      get: () => {
        reads += 1;
        throw new Error("PRIVATE_FAILURE_GETTER");
      }
    });
    const traced = automationStudioLlmEvidenceLoopProgressTrace({ ...loopInput(), executeTool: async (_input: { callId: string; toolId: string; value: { node: string } }) => original }, { FLUXIQ_BUILD_DECISION_DUMP: dir, FLUXIQ_LLM_STEP_LOG_DIR: steps });
    const result = await traced.executeTool({ callId: "c3", toolId: "core.run_node", value: { node: "fixture.action" } });
    expect(reads).toBe(0);
    expect(Object.hasOwn(result, "failure")).toBe(false);
    expect(Object.getOwnPropertyDescriptor(original, "failure")?.get).toBeTypeOf("function");
    expect(records(dir)[0]).toMatchObject({ result: { evidence: original.evidence, effectApplied: true } });
  });

  it("sanitizes the direct dump entry and keeps opaque non-tool results untouched", () => {
    const dir = directory();
    const dump = automationStudioLlmEvidenceDecisionDump({ FLUXIQ_BUILD_DECISION_DUMP: dir })!;
    const evidence = { retained: "actual evidence" };
    const original = { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, failure: { category: "action_failed", code: "service.capacity", retryable: true, effect: "unacted", transient: true, expected: "PRIVATE_DIRECT_EXPECTED", actual: "PRIVATE_DIRECT_ACTUAL", evidenceDigest: "b".repeat(64) } };
    const malformed = { ...original, failure: { ...original.failure, transient: false } };
    dump.tool({ callId: "c1", toolId: "tool", ms: 1, request: {}, result: original });
    dump.tool({ callId: "c2", toolId: "tool", ms: 1, request: {}, result: malformed });
    const written = records(dir);
    expect(written[0]).toMatchObject({ result: { evidence, effectApplied: false, failure: { transient: true } } });
    expect(written[1]).toMatchObject({ result: { evidence, effectApplied: false } });
    expect(Object.hasOwn(written[1]!.result as object, "failure")).toBe(false);
    for (const privateValue of ["PRIVATE_DIRECT_EXPECTED", "PRIVATE_DIRECT_ACTUAL", "b".repeat(64)]) expect(JSON.stringify(written)).not.toContain(privateValue);
    expect(original.failure.expected).toBe("PRIVATE_DIRECT_EXPECTED");
    expect(malformed.failure.transient).toBe(false);
    const opaque = { evidence, failure: { expected: "opaque application result" } };
    expect(automationStudioLlmEvidenceToolExecutionControl(opaque)).toBe(opaque);
    dump.tool({ callId: "c3", toolId: "tool", ms: 1, request: {}, result: opaque });
    expect(records(dir)[2]).toMatchObject({ result: opaque });
  });
});
