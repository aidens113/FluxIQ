// The build's progress trace is off by default, and when on it prints where the
// time went and nothing a run was shown or sent.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLoopProgressTrace } from "../index.ts";
import { AutomationStudioLlmUnusableDecisionError } from "../../unusable-decision.ts";

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

  // `run-muntmwvx-0d53884a` printed model-written call ids that spelled out the
  // instruction's words; only numbered ids and Core's own reach the log.
  it("prints a call id only when it is numbered or Core's own", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    for (const callId of ["c18", "initial.core.run_node", "add_kettle_to_cart", "pick_Millbrook_store", "dryrun.3.reset", "dryrun.3.26", "dryrun.3.kettle"]) await traced.executeTool({ callId, toolId: "web.look", value: { text: "" } });
    // A dry run's own calls are Core's too, so a completion that replayed can
    // be told in the log from one that reused an earlier verdict and made none.
    expect(lines.filter((line) => line.includes("tool start")).map((line) => /callId=(\S+)/u.exec(line)?.[1])).toEqual(["c18", "initial.core.run_node", "-", "-", "dryrun.3.reset", "dryrun.3.26", "-"]);
  });

  it("names a refused completion by its issue codes", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await expect(traced.checkCompletion({ summary: SECRET_PAGE_TEXT }, { steps: [] })).resolves.toMatchObject({ ok: false });
    expect(lines.at(-1)).toMatch(/completion check ok=false issues=bootstrap\.instruction_actions_missing$/u);
    expect(lines.join("\n")).not.toContain("Kettle");
  });

  // `run-munw7ffn-fe1cecd2` printed `code=- issues=-` for all 14 of its
  // unusable decisions: the issue codes sit on the error itself, and the
  // reply's account was nowhere.
  it("names an unusable decision by its issue codes and the unreadable reply's account", async () => {
    const lines: string[] = [];
    const unusable = new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: "content_unclosed", finishReason: "stop", contentChars: 2140, usage: { outputTokens: 571 } });
    const traced = automationStudioLlmEvidenceLoopProgressTrace({ ...loopInput(), decide: async (_input: { iteration: number; evidence: string[] }) => { throw unusable; } }, { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await expect(traced.decide({ iteration: 7, evidence: [] })).rejects.toBe(unusable);
    expect(lines.at(-1)).toMatch(/decide throw iteration=7 ms=\d+ name=AutomationStudioLlmUnusableDecisionError code=- issues=llm\.provider_malformed_response reply=content_unclosed finish=stop chars=2140 out=571$/u);
  });

  it("names a failed decision by its codes and rethrows it", async () => {
    const lines: string[] = [];
    const traced = automationStudioLlmEvidenceLoopProgressTrace(loopInput(true), { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    await expect(traced.decide({ iteration: 2, evidence: [] })).rejects.toThrow(SECRET_PAGE_TEXT);
    expect(lines.at(-1)).toMatch(/decide throw iteration=2 ms=\d+ name=Error code=flow_bootstrap\.provider_transport_timeout issues=llm\.provider\.timeout$/u);
    expect(lines.join("\n")).not.toContain("Kettle");
  });

  // Lane t195, run-munsxchc-15523952: four instructed-act refusals and thirteen
  // amendments, and the log could say neither which act nor what was amended.
  it("says what an amendment changed and why a completion was refused, in numbers and closed words only", async () => {
    const lines: string[] = [];
    let next: unknown;
    const input = {
      decide: async (_input: { iteration: number }) => next,
      executeTool: async (_input: { callId: string; toolId: string }) => ({ resultCode: "web.action.succeeded" }),
      checkCompletion: async (_result: unknown, _context: unknown) => ({
        ok: false,
        issueCodes: ["bootstrap.instructed_act_missing"],
        feedback: { missingActs: { acts: [{ id: "a1", kind: "confirm", verb: "confirm", quote: SECRET_PAGE_TEXT, plural: true, reason: "act_needs_repeat", step: "d7" }] } }
      })
    };
    const traced = automationStudioLlmEvidenceLoopProgressTrace(input, { FLUXIQ_BUILD_PROGRESS_TRACE: "1" }, (line) => lines.push(line));
    next = { kind: "amend_draft", amendments: [{ step: 7, change: "repeat", over: 6, through: 8 }, { step: 9, change: "drop" }, { step: 3, change: "rerun", input: { note: SECRET_PAGE_TEXT } }] };
    await traced.decide({ iteration: 4 });
    next = { kind: "complete", result: { acts: [{ action: "a1", step: "d7" }, { act: SECRET_PAGE_TEXT, step: 7 }] } };
    await traced.decide({ iteration: 5 });
    await traced.checkCompletion({}, {});

    const shown = lines.map((line) => line.replace(/^\[FluxIQ build-trace\] \S+ /u, "").replace(/ms=\d+/u, "ms=N"));
    expect(shown).toContain("decide end iteration=4 ms=N kind=amend_draft amend=7:repeat(over=6,through=8),9:drop,3:rerun");
    expect(shown).toContain("decide end iteration=5 ms=N kind=complete acts=a1>d7,->7");
    expect(shown.at(-1)).toBe("completion check ok=false issues=bootstrap.instructed_act_missing missing=a1:act_needs_repeat");
    expect(lines.join(" ")).not.toContain("Kettle");
  });
});
