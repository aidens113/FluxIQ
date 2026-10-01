// The decision dump writes a build's decisions, tool calls and checks in full,
// only where it is pointed, and never through the trace's log.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDecisionDump, automationStudioLlmEvidenceLoopProgressTrace } from "../index.ts";

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
});
