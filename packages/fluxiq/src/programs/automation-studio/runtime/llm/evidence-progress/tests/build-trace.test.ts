// The build trace's lines outside the loop (t174-w116, R3 of debug
// `run-musq0b1m-0472cfa0`): 17.1 s between the last judge and the chat's
// ending were in no record, because `[FluxIQ build-trace]` had no judge,
// build or apply lines -- only the loop's own.
import { describe, expect, it } from "vitest";
import { automationStudioLlmBuildTrace } from "../index.ts";

const ON = { FLUXIQ_BUILD_PROGRESS_TRACE: "1" };
const LINE = /^\[FluxIQ build-trace\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /u;

describe("automationStudioLlmBuildTrace", () => {
  it("writes one timestamped line only when the trace is on", () => {
    const lines: string[] = [];
    automationStudioLlmBuildTrace.line("judge start", ON, (line) => lines.push(line));
    automationStudioLlmBuildTrace.line("judge start", {}, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(LINE);
    expect(lines[0]).toMatch(/ judge start$/u);
  });

  it("times a step: its start, then its end with the milliseconds and the outcome, returning what it returned", async () => {
    const lines: string[] = [];
    const value = await automationStudioLlmBuildTrace.timed("apply", async () => ({ status: "applied" }), (applied) => `status=${applied.status}`, ON, (line) => lines.push(line));
    expect(value).toEqual({ status: "applied" });
    expect(lines.map((line) => line.replace(LINE, ""))).toEqual(["apply start", expect.stringMatching(/^apply end ms=\d+ status=applied$/u)]);
  });

  it("says a step that threw, by its name and code only, and throws it on", async () => {
    const lines: string[] = [];
    const failure = Object.assign(new Error("secret page words"), { code: "flow_bootstrap.persistence_failed" });
    await expect(automationStudioLlmBuildTrace.timed("build", async () => { throw failure; }, undefined, ON, (line) => lines.push(line))).rejects.toBe(failure);
    expect(lines[1]!.replace(LINE, "")).toMatch(/^build throw ms=\d+ name=Error code=flow_bootstrap\.persistence_failed$/u);
    expect(lines.join("\n")).not.toContain("secret");
  });

  it("keeps an outcome to code-shaped words", async () => {
    const lines: string[] = [];
    await automationStudioLlmBuildTrace.timed("judge", async () => 1, () => "verdict=no why=The page said Cart (3)", ON, (line) => lines.push(line));
    expect(lines[1]!.replace(LINE, "")).toMatch(/^judge end ms=\d+ verdict=no why=-$/u);
  });
});
