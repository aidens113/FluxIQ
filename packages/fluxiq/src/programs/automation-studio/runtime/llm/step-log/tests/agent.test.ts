// Which of a project build's agents made each step: `role` and `briefId` in
// every kind of step's meta.json, and two more index.md columns once any agent
// has written to the directory.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmStepLogAnswer, automationStudioLlmStepLogModelStep, automationStudioLlmStepLogScope, automationStudioLlmStepLogTool } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-step-agent-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

function meta(folder: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as Record<string, unknown>;
}

function index(): string {
  return readFileSync(path.join(directory, "index.md"), "utf8");
}

function modelStep() {
  return automationStudioLlmStepLogModelStep({ provider: "deepseek", model: "m", url: "https://api.example/chat", body: "{}", taskKind: "evidence_tool_decision", requestId: `r.${Math.random()}` }, env());
}

describe("the agent a step is written under", () => {
  it("writes role and brief id in the meta of a model, a tool and an answer step, keeping the part, round and phase", async () => {
    const tool = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: true }), env());
    await automationStudioLlmStepLogScope.within({ part: "creation" }, () =>
      automationStudioLlmStepLogScope.agent({ role: "builder", briefId: "b-save" }, () =>
        automationStudioLlmStepLogScope.run({ round: 2, phase: "explore" }, async () => {
          modelStep()!.succeeded({ kind: "evidence_tool_decision" });
          await tool({ callId: "c1", toolId: "web.look" });
          automationStudioLlmStepLogAnswer({ iteration: 3, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_amended", amended: 1 }, env());
        }, env()), env()), env());

    for (const folder of ["0001-decide", "0002-tool-web.look", "0003-answer-amend_draft"]) {
      expect(meta(folder)).toMatchObject({ part: "creation", round: 2, phase: "explore", role: "builder", briefId: "b-save" });
    }
    expect(index()).toContain("| Step | Kind | Role | Brief | Tool | Summary | Cost |");
    expect(index()).toContain("| 0002 | tool | builder | b-save | web.look | ok | - |");
    expect(automationStudioLlmStepLogScope.current()).toBeUndefined();
  });

  it("writes role and brief id null outside every agent, and keeps today's index columns", async () => {
    modelStep()!.succeeded({ kind: "evidence_tool_decision" });
    await automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: true }), env())({ callId: "c1", toolId: "web.look" });
    expect(meta("0001-decide")).toMatchObject({ role: null, briefId: null });
    expect(index()).toContain("| Step | Kind | Tool | Summary | Cost |");
    expect(index()).toContain("| 0002 | tool | web.look | ok | - |");
    expect(index()).not.toContain("Role");
  });

  it("takes the innermost agent whole: the supervisor inside a builder's scope carries no brief id", () => {
    automationStudioLlmStepLogScope.agent({ role: "builder", briefId: "b-1" }, () =>
      automationStudioLlmStepLogScope.agent({ role: "supervisor" }, () => modelStep()!.succeeded({ kind: "evidence_tool_decision" }), env()), env());
    expect(meta("0001-decide")).toMatchObject({ role: "supervisor", briefId: null });
  });

  it("keeps two builders working at once apart, and lists a step outside any agent with dashes", async () => {
    const tool = automationStudioLlmStepLogTool(async (request: { callId: string; toolId: string }) => {
      await tick();
      return { ok: true, callId: request.callId };
    }, env());
    await Promise.all(["b-1", "b-2"].map((briefId) =>
      automationStudioLlmStepLogScope.agent({ role: "builder", briefId }, async () => {
        await tick();
        await tool({ callId: briefId, toolId: "web.look" });
      }, env())));
    await tool({ callId: "plain", toolId: "web.look" });
    const metas = ["0001-tool-web.look", "0002-tool-web.look", "0003-tool-web.look"].map(meta);
    for (const written of metas.slice(0, 2)) expect(written.briefId).toBe(written.callId);
    expect(metas[2]).toMatchObject({ role: null, briefId: null });
    expect(index()).toContain("| 0003 | tool | - | - | web.look | ok | - |");
  });

  it("does nothing with the step log off", () => {
    expect(automationStudioLlmStepLogScope.agent({ role: "builder", briefId: "b-1" }, () => automationStudioLlmStepLogScope.current(), {})).toBeUndefined();
  });
});
