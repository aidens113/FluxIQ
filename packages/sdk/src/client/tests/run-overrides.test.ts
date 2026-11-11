import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineFluxNode } from "../../define/index.ts";
import { SdkError } from "../../errors/index.ts";
import { pipeline } from "../../pipeline/index.ts";
import { FLUXNODE_PROMPT_SECTIONS, type FluxNodePromptSectionId } from "../../index.ts";
import { buildPipelineRunRequest } from "../build-pipeline-run-request.ts";
import { buildResumeRequest, buildRunRequest } from "../build-run-request.ts";
import type { ResumeOptions } from "../resume-options.ts";
import type { RunOptions } from "../run-types.ts";

/** What a JS caller can pass to resume though the type does not offer it. */
const jsResume = (overrides: Record<string, unknown>): ResumeOptions => ({ overrides }) as unknown as ResumeOptions;

const node = defineFluxNode({ name: "demo.read-title", runtime: "web", goal: "Read the title.", start: "https://example.test/", outputs: z.object({ title: z.string() }), scope: { sites: ["example.test"], acts: ["read"] } });

describe("run overrides", () => {
  it("still sends an options-only overrides as request.options", () => {
    const request = buildRunRequest(node, {}, { overrides: { retries: 5 } });
    expect(request.options).toEqual({ retries: 5 });
    expect(request).not.toHaveProperty("overrides");
  });

  it("splits one flat overrides object into request.options and request.overrides", () => {
    const section: FluxNodePromptSectionId = "explorer.role.task";
    const request = buildRunRequest(node, {}, { overrides: { retries: 6, budgetUsd: 1, prompts: { [section]: { mode: "append", text: "Prefer the header." } }, judgeCriteria: ["Title is not empty."], pace: { minStepGapMs: 500 } } });
    expect(request.options).toEqual({ retries: 6, budgetUsd: 1 });
    expect(request.overrides).toEqual({ prompts: { "explorer.role.task": { mode: "append", text: "Prefer the header." } }, judgeCriteria: ["Title is not empty."], pace: { minStepGapMs: 500 } });
  });

  it("sends overrides-only keys without an options field", () => {
    const request = buildRunRequest(node, {}, { overrides: { models: { judge: "claude-haiku-5-5" } } });
    expect(request).not.toHaveProperty("options");
    expect(request.overrides).toEqual({ models: { judge: "claude-haiku-5-5" } });
  });

  it("leaves an unknown key in overrides, for the engine to refuse by name", () => {
    const request = buildRunRequest(node, {}, { overrides: { mystery: 1 } as unknown as NonNullable<RunOptions["overrides"]> });
    expect(request.overrides).toEqual({ mystery: 1 });
  });

  it("passes overrides on a pipeline run the same way", () => {
    const built = pipeline("demo.pass").fromInput("rows").transform({ fn: (records) => records }).build();
    const request = buildPipelineRunRequest(built, {}, { overrides: { retries: 4, judgeCriteria: ["Rows are not empty."] } });
    expect(request.options).toEqual({ retries: 4 });
    expect(request.overrides).toEqual({ judgeCriteria: ["Rows are not empty."] });
  });

  it("exports the section ids", () => {
    expect(FLUXNODE_PROMPT_SECTIONS["explorer.role.task"]?.policy).toBe("open");
  });
});

describe("resume", () => {
  it("builds a bare resume request", () => {
    expect(buildResumeRequest("handle-0000000001", {})).toEqual({ resumeHandle: "handle-0000000001" });
  });

  it("refuses options a JS caller passed, by the contract's code, before building a request", () => {
    const attempt = () => buildResumeRequest("handle-0000000001", jsResume({ retries: 5 }));
    expect(attempt).toThrow(SdkError);
    expect(attempt).toThrowError(expect.objectContaining({ code: "run_request.options_on_resume" }));
  });

  it("refuses overrides a JS caller passed", () => {
    expect(() => buildResumeRequest("handle-0000000001", jsResume({ judgeCriteria: ["x"] }))).toThrowError(expect.objectContaining({ code: "run_request.overrides_on_resume" }));
  });
});
