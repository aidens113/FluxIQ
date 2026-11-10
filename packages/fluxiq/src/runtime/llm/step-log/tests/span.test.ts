// The step log's spans (task speed S0): what a tool call's own work timed,
// written to the step's `meta.json`, and nothing anywhere when no step is open.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmStepLogSpans, automationStudioLlmStepLogTool } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-span-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });
const execution = { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded" };

function meta(folder: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as Record<string, unknown>;
}

describe("a tool step's spans", () => {
  it("writes what the call's work timed, relative to the step's start and in the order it began", async () => {
    const run = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => {
      const begun = Date.now() - 1;
      // Recorded out of order, and one across an await, as a node run records them.
      await automationStudioLlmStepLogSpans.time("look.after", async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
      automationStudioLlmStepLogSpans.record("look.before", begun, begun + 2, "proof");
      return execution;
    }, env());
    await run({ callId: "c1", toolId: "core.run_node" });
    const spans = meta("0001-tool-core.run_node").spans as Array<{ name: string; at: number; ms: number; detail?: string }>;
    expect(spans.map((span) => span.name)).toEqual(["look.before", "look.after"]);
    expect(spans[0]).toMatchObject({ ms: 2, detail: "proof" });
    expect(spans[0]!.at).toBeGreaterThanOrEqual(-1);
    expect(spans[1]!.ms).toBeGreaterThanOrEqual(4);
  });

  it("writes the spans of a call that threw, and none for a call that timed nothing", async () => {
    const throws = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => {
      automationStudioLlmStepLogSpans.record("send.click", Date.now(), Date.now());
      throw new Error("gone");
    }, env());
    const quiet = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => execution, env());
    await expect(throws({ callId: "c1", toolId: "core.run_node" })).rejects.toThrow("gone");
    await quiet({ callId: "c2", toolId: "core.run_node" });
    expect(meta("0001-tool-core.run_node").spans).toEqual([{ name: "send.click", at: expect.any(Number), ms: 0 }]);
    expect(meta("0002-tool-core.run_node")).not.toHaveProperty("spans");
  });

  it("keeps the spans of two calls running at once apart", async () => {
    const run = automationStudioLlmStepLogTool(async (request: { callId: string; toolId: string }) => {
      await new Promise((resolve) => setTimeout(resolve, request.callId === "a" ? 10 : 1));
      automationStudioLlmStepLogSpans.record(`look.${request.callId}`, Date.now(), Date.now());
      return execution;
    }, env());
    await Promise.all([run({ callId: "a", toolId: "web.look" }), run({ callId: "b", toolId: "web.look" })]);
    expect((meta("0001-tool-web.look").spans as Array<{ name: string }>).map((span) => span.name)).toEqual(["look.a"]);
    expect((meta("0002-tool-web.look").spans as Array<{ name: string }>).map((span) => span.name)).toEqual(["look.b"]);
  });

  it("records nothing outside a step, refuses a span that is not one, and keeps labels short", async () => {
    expect(() => automationStudioLlmStepLogSpans.record("look.before", 1, 2)).not.toThrow();
    const run = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => {
      automationStudioLlmStepLogSpans.record("", 1, 2);
      automationStudioLlmStepLogSpans.record("backwards", 5, 4);
      automationStudioLlmStepLogSpans.record("x".repeat(100), 1, 2, "y".repeat(100));
      return execution;
    }, env());
    await run({ callId: "c1", toolId: "core.run_node" });
    const spans = meta("0001-tool-core.run_node").spans as Array<{ name: string; detail: string }>;
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toHaveLength(64);
    expect(spans[0]!.detail).toHaveLength(64);
  });

  it("shares one store between two copies of the module, as a domain's import and the web server's bundle are", async () => {
    // A query makes the module load a second time: another copy, as a bundler's would be.
    const specifier = "../span.ts?second-copy";
    const copy = (await import(/* @vite-ignore */ specifier)) as { automationStudioLlmStepLogSpans: typeof automationStudioLlmStepLogSpans };
    expect(copy.automationStudioLlmStepLogSpans).not.toBe(automationStudioLlmStepLogSpans);
    const collected = automationStudioLlmStepLogSpans.collect(async () => copy.automationStudioLlmStepLogSpans.record("send.click", 1, 2));
    await collected.done;
    expect(collected.spans().map((span) => span.name)).toEqual(["send.click"]);
  });

  it("leaves the call untouched with the step log off", async () => {
    const work = async (_request: { callId: string; toolId: string }) => execution;
    expect(automationStudioLlmStepLogTool(work, {})).toBe(work);
  });
});
