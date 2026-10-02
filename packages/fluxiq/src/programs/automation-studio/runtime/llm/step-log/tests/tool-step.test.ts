// The step log's tool steps: the call as the model made it, exactly the
// evidence the loop hands the model back, the page view it carries, and a
// test folder for a Flow test's replays.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLoopProgressTrace } from "../../evidence-progress/index.ts";
import { automationStudioLlmStepLogScope, automationStudioLlmStepLogTool } from "../index.ts";

const PAGE = "page https://shop.example/cart\n[b1] button \"Checkout\"\n[t2] text \"Kettle 42.99\"";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-tool-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });

function execution(evidence: unknown) {
  return { kind: "llm_evidence_tool_execution" as const, evidence, effectApplied: true, resultCode: "web.action.succeeded", resultReason: "clicked" };
}

describe("a tool step", () => {
  it("writes the call, exactly the evidence the model is given back, the page view, and its meta", async () => {
    const evidence = { ok: true, value: { page: { schemaVersion: "web-llm-page.v3", page: PAGE } } };
    const run = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string; value: unknown }) => execution(evidence), env());

    await expect(run({ callId: "c3", toolId: "core:run_node", value: { nodeId: "web.click", target: "b1" } })).resolves.toMatchObject({ resultCode: "web.action.succeeded" });

    const step = path.join(directory, "0001-tool-core_run_node");
    expect(readdirSync(step).sort()).toEqual(["call.json", "meta.json", "page.txt", "result.json"]);
    expect(json(path.join(step, "call.json"))).toEqual({ callId: "c3", toolId: "core:run_node", input: { nodeId: "web.click", target: "b1" } });
    expect(json(path.join(step, "result.json"))).toEqual(evidence);
    expect(readFileSync(path.join(step, "page.txt"), "utf8")).toBe(PAGE);
    expect(json(path.join(step, "meta.json"))).toMatchObject({
      step: 1, kind: "tool", callId: "c3", toolId: "core:run_node", round: null, phase: "explore",
      resultCode: "web.action.succeeded", resultReason: "clicked", effectApplied: true, status: "ok"
    });
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0001 | tool | core:run_node | web.action.succeeded | - |");
  });

  it("names a replay inside a test scope, or under a dry run's call id, a test step", async () => {
    const run = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => execution({ ok: true }), env());

    await automationStudioLlmStepLogScope.run({ round: 2, phase: "test" }, () => run({ callId: "replay.1", toolId: "web.look" }), env());
    await automationStudioLlmStepLogScope.run({ round: 1, phase: "explore" }, () => run({ callId: "dryrun.3.2", toolId: "web.look" }), env());

    expect(readdirSync(directory).sort()).toEqual(["0001-test-web.look", "0002-test-web.look", "index.md"]);
    expect(json(path.join(directory, "0001-test-web.look", "meta.json"))).toMatchObject({ kind: "test", round: 2, phase: "test" });
    expect(json(path.join(directory, "0002-test-web.look", "meta.json"))).toMatchObject({ kind: "test", round: 1, phase: "explore" });
  });

  it("writes a raw answer as it came, and a throw as its name and code, rethrowing it", async () => {
    const raw = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: false, code: "web.target_missing" }), env());
    await raw({ callId: "c1", toolId: "web.look" });
    const failing = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }): Promise<unknown> => {
      throw Object.assign(new Error("Kettle 42.99 was not found"), { code: "web.page_closed" });
    }, env());
    await expect(failing({ callId: "c2", toolId: "web.look" })).rejects.toThrow("Kettle 42.99 was not found");

    expect(json(path.join(directory, "0001-tool-web.look", "result.json"))).toEqual({ ok: false, code: "web.target_missing" });
    expect(json(path.join(directory, "0001-tool-web.look", "meta.json"))).toMatchObject({ resultCode: null, summary: "refused" });
    expect(json(path.join(directory, "0002-tool-web.look", "result.json"))).toEqual({ error: { name: "Error", code: "web.page_closed" } });
    expect(json(path.join(directory, "0002-tool-web.look", "meta.json"))).toMatchObject({ status: "threw", summary: "threw web.page_closed" });
    expect(readFileSync(path.join(directory, "0002-tool-web.look", "result.json"), "utf8")).not.toContain("Kettle");
  });

  it("is the same function, writing nothing, when the directory is unset or relative", async () => {
    const tool = async (_request: { callId: string; toolId: string }) => execution({ ok: true });
    expect(automationStudioLlmStepLogTool(tool, {})).toBe(tool);
    expect(automationStudioLlmStepLogTool(tool, { FLUXIQ_LLM_STEP_LOG_DIR: "steps" })).toBe(tool);
    await automationStudioLlmStepLogTool(tool, {})({ callId: "c1", toolId: "web.look" });
    expect(readdirSync(directory)).toEqual([]);
  });

  it("is turned on in the evidence loop's wrapper by the step log alone", async () => {
    const input = {
      decide: async (_request: { iteration: number }) => ({ kind: "complete" }),
      executeTool: async (_request: { callId: string; toolId: string; value: unknown }) => execution({ ok: true, page: PAGE })
    };
    const wrapped = automationStudioLlmEvidenceLoopProgressTrace(input, env(), () => undefined);
    expect(wrapped).not.toBe(input);
    await wrapped.executeTool({ callId: "initial.web.look", toolId: "web.look", value: {} });
    expect(readFileSync(path.join(directory, "0001-tool-web.look", "page.txt"), "utf8")).toBe(PAGE);
  });
});

function json(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}
