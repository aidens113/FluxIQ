// The step log's flow steps: one pass of a Flow run over one node, which no
// tool call wraps, written as its own `NNNN-flow-<definitionId>` folder with the
// spans the step loop and the domain timed inside it (task speed S0, S10).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmStepLogFlowStep, automationStudioLlmStepLogSpans, automationStudioLlmStepLogTool } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-flow-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

describe("a flow step", () => {
  it("writes meta.json alone, with the node, its outcome code and every span recorded inside it", async () => {
    const step = automationStudioLlmStepLogFlowStep({ nodeId: "n4", definitionId: "web.output.dom-click" }, env())!;
    const startedAt = Date.now();
    const value = await step.within(async () => {
      automationStudioLlmStepLogSpans.record("send.click", startedAt, startedAt + 5, "succeeded");
      return "the page said 42.99";
    });
    step.record("arrival", startedAt, startedAt + 1);
    step.finish({ status: "failed", code: "web.target.not_found" });
    step.finish({ status: "succeeded" });

    expect(value).toBe("the page said 42.99");
    expect(readdirSync(directory).sort()).toEqual(["0001-flow-web.output.dom-click", "index.md"]);
    expect(readdirSync(path.join(directory, "0001-flow-web.output.dom-click"))).toEqual(["meta.json"]);
    const meta = json(path.join(directory, "0001-flow-web.output.dom-click", "meta.json"));
    expect(meta).toMatchObject({ step: 1, kind: "flow", toolId: "web.output.dom-click", nodeId: "n4", status: "failed", resultCode: "web.target.not_found", phase: "flow" });
    expect((meta.spans as Array<{ name: string }>).map((span) => span.name).sort()).toEqual(["arrival", "send.click"]);
    expect(JSON.stringify(meta)).not.toContain("42.99");
  });

  it("is nothing with the step log off", () => {
    expect(automationStudioLlmStepLogFlowStep({ nodeId: "n1", definitionId: "web.output.dom-click" }, {})).toBeUndefined();
  });

  it("is nothing inside a tool step, whose spans stay the tool step's", async () => {
    let nested: unknown = "unset";
    const tool = automationStudioLlmStepLogTool(async () => {
      nested = automationStudioLlmStepLogFlowStep({ nodeId: "n1", definitionId: "web.output.dom-click" }, env());
      automationStudioLlmStepLogSpans.record("send.click", Date.now(), Date.now());
      return { ok: true };
    }, env());
    await tool({ callId: "c1", toolId: "core.run_node" });

    expect(nested).toBeUndefined();
    expect(readdirSync(directory).sort()).toEqual(["0001-tool-core.run_node", "index.md"]);
    const meta = json(path.join(directory, "0001-tool-core.run_node", "meta.json"));
    expect((meta.spans as Array<{ name: string }>).map((span) => span.name)).toEqual(["send.click"]);
  });
});

describe("a flow step's humanness record", () => {
  const meta = () => json(path.join(directory, readdirSync(directory).find((name) => name.startsWith("0001-"))!, "meta.json"));

  it("writes how the page action was made above humanness 0: level, aim and a misclick's point", () => {
    const step = automationStudioLlmStepLogFlowStep({ nodeId: "n1", definitionId: "web.output.dom-click" }, env())!;
    step.finish({ status: "succeeded", outputs: { ok: true, result: { humanness: { level: 80, aimed: true, misclick: { x: 12, y: 40 } }, url: "https://shop.example/" } } });
    expect(meta().humanness).toEqual({ level: 80, aimed: true, misclick: { x: 12, y: 40 } });
  });

  it("writes no humanness key at level 0, with no outputs, or for a malformed record", () => {
    for (const outputs of [undefined, { ok: true }, { ok: true, result: { url: "https://shop.example/" } }, { result: { humanness: { level: "80", aimed: true } } }, { result: { humanness: { level: 80 } } }]) {
      rmSync(directory, { recursive: true, force: true });
      directory = mkdtempSync(path.join(tmpdir(), "fluxiq-flow-step-"));
      const step = automationStudioLlmStepLogFlowStep({ nodeId: "n1", definitionId: "web.output.dom-click" }, env())!;
      step.finish({ status: "succeeded", ...(outputs ? { outputs } : {}) });
      expect(meta()).not.toHaveProperty("humanness");
    }
  });
});
