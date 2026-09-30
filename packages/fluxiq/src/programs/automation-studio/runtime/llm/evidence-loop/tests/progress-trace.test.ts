// The build's progress trace is off by default, and when on it prints where the
// time went and nothing a run was shown or sent.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLoopProgressTrace } from "../index.ts";

const SECRET_PAGE_TEXT = "Kettle 1.7L stainless, basket total 42.99";

function loopInput(fail = false) {
  return {
    decide: async (_input: { iteration: number; evidence: string[] }) => {
      if (fail) throw Object.assign(new Error(SECRET_PAGE_TEXT), { diagnostic: { code: "flow_bootstrap.provider_transport_timeout", issueCodes: ["llm.provider.timeout"] } });
      return { kind: "tool_call", note: SECRET_PAGE_TEXT };
    },
    executeTool: async (_input: { callId: string; toolId: string; value: { text: string } }) => ({ resultCode: "web.action.succeeded", evidence: SECRET_PAGE_TEXT }),
    checkCompletion: async (_result: { summary: string }, _context: { steps: string[] }) => ({ ok: false, issueCodes: ["bootstrap.instruction_actions_missing"], feedback: { note: SECRET_PAGE_TEXT } })
  };
}

describe("the evidence loop's progress trace", () => {
  it("is the same input, untouched, unless switched on", () => {
    const input = loopInput();
    expect(automationStudioLlmEvidenceLoopProgressTrace(input, {})).toBe(input);
  });

  it("times each tool and decision by id, kind and code, and prints no content", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await traced.executeTool({ callId: "call.1", toolId: "web.look", value: { text: SECRET_PAGE_TEXT } });
    await traced.decide({ iteration: 1, evidence: [SECRET_PAGE_TEXT] });
    expect(lines.map((line) => line.replace(/^\[FluxIQ build-trace\] \S+ /u, "").replace(/ms=\d+/u, "ms=N"))).toEqual([
      "loop start",
      "tool start callId=call.1 toolId=web.look",
      "tool end toolId=web.look ms=N resultCode=web.action.succeeded",
      "decide start iteration=1",
      "decide end iteration=1 ms=N kind=tool_call"
    ]);
    expect(lines.join("\n")).not.toContain("Kettle");
  });

  it("names a refused completion by its issue codes", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await expect(traced.checkCompletion({ summary: SECRET_PAGE_TEXT }, { steps: [] })).resolves.toMatchObject({ ok: false });
    expect(lines.at(-1)).toMatch(/completion check ok=false issues=bootstrap\.instruction_actions_missing$/u);
    expect(lines.join("\n")).not.toContain("Kettle");
  });

  it("names a failed decision by its codes and rethrows it", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(true), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await expect(traced.decide({ iteration: 2, evidence: [] })).rejects.toThrow(SECRET_PAGE_TEXT);
    expect(lines.at(-1)).toMatch(/decide throw iteration=2 ms=\d+ name=Error code=flow_bootstrap\.provider_transport_timeout issues=llm\.provider\.timeout$/u);
    expect(lines.join("\n")).not.toContain("Kettle");
  });
});
