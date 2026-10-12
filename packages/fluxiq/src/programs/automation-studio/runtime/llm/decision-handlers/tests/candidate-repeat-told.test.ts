// In candidate mode (`discoveryOnly`) the loop has no draft, and a round that
// stalls ends the build with nothing tested. Lane C (`run-mv0fuotv-805294d7`,
// C2) resent one refused script three times and was told to amend the draft
// (`../refused-repeat.ts`); lane D was warned of a final test and judgement
// that never comes (`../refusal-run.ts`).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../loop-configuration.ts";

const ISSUES = [{ code: "authoring.repeat.bound_inside_span", path: "plan.subflows.0.nodes.9", step: 10, line: 27, instead: "Write `repeat most: 10` under `repeat while`." }];
const look = { toolId: "demo.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe" as const };
const submit = { toolId: "core.submit_candidate", description: "Submit.", inputSchema: { type: "object" }, effect: "observe" as const };
const LEGACY = /amend_draft|amend the draft|\bdraft\b|\brerun\b|mark (?:it )?optional|tested and judged|Flow so far/iu;
const stalledError = new Error("stalled");
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

/**
 * Every submission is refused for one reason, as the candidate loop refuses one
 * (`../../../flow-bootstrap/candidate/authoring-loop.ts`), under `resultCode`:
 * since t378 a refusal's code ends in a digest of its issues (`<category>:<8 hex>`).
 */
function executor(resultCode = "flow_bootstrap.completion_refused"): AutomationStudioLlmEvidenceLoopInput["executeTool"] {
  return async ({ toolId }) => {
    if (toolId === "demo.look") return { kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, stateDigests: { before: "page", after: "page" } };
    return { kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, evidence: { ok: false, revision: 1, diagnostics: { ok: false, refusal: "flow_bootstrap.completion_refused", issues: ISSUES }, issueCodes: ISSUES.map((issue) => issue.code), next: "Correct every listed issue." }, resultCode, draft: { proposes: true } };
  };
}

function loop(...decisions: JsonObject[]) {
  return loopWith(executor(), ...decisions);
}

function loopWith(executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"], ...decisions: JsonObject[]) {
  const decide = vi.fn();
  for (const decision of decisions) decide.mockResolvedValueOnce(decision);
  decide.mockRejectedValue(new Error("script exhausted"));
  const run = runAutomationStudioLlmEvidenceLoop({
    tools: [look, submit], decide, executeTool, maxIterations: 20, maxToolCalls: 20, draft: false, dryRun: false, discoveryOnly: true, propagateDecisionErrors: true,
    unusableDecisions: { maxConsecutive: 10, stalled: () => stalledError }
  });
  return { decide, run };
}
const call = (toolId: string, callId: string, input: JsonObject) => ({ kind: "tool_call", toolId, callId, input });
const script = (flow: string) => ({ flow });

describe("candidate mode", () => {
  it("answers an identical resubmission with the refusal's issues and says it ends the build untested", async () => {
    const same = script("flow: Read\nstep: open\n  node: web.browser-navigate");
    const { decide, run } = loop(call("demo.look", "look", {}), call("core.submit_candidate", "s1", same), call("core.submit_candidate", "s2", same), call("core.submit_candidate", "s3", same), call("core.submit_candidate", "s4", same));

    await expect(run).rejects.toBe(stalledError);

    const first = shownAt(decide, 3).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(first).toMatchObject({ code: "llm_evidence_loop.repeat_refused", sameAsCall: "s1", issues: ISSUES, refusedInARow: 1 });
    expect(String(first?.instruction)).toContain("not checked again");
    expect(String(first?.instruction)).not.toMatch(LEGACY);
    const second = shownAt(decide, 4).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(String(second?.instruction)).toContain("Sending it unchanged again ends this build with nothing tested.");
    expect(String(second?.instruction)).not.toMatch(LEGACY);
  });

  it("warns that one more refusal of the same kind ends the build with nothing tested, not a final test", async () => {
    const { decide, run } = loop(call("demo.look", "look", {}), call("core.submit_candidate", "s1", script("flow: A")), call("core.submit_candidate", "s2", script("flow: B")), call("core.submit_candidate", "s3", script("flow: C")));

    await expect(run).rejects.toBe(stalledError);

    const warned = shownAt(decide, 3).find((entry) => entry.toolId === "core.refusal_run")?.value;
    expect(warned).toMatchObject({ code: "llm_evidence_loop.refused_in_a_row", inARow: 2 });
    expect(String(warned?.instruction)).toContain("One more decision refused for it ends this build with nothing tested.");
    expect(String(warned?.instruction)).not.toMatch(LEGACY);
  });

  it("names the refused issues in words in the warning, never the digest its refusal is counted under", async () => {
    const digested = executor("flow_bootstrap.completion_refused:3fa2b1c9");
    const { decide, run } = loopWith(digested, call("demo.look", "look", {}), call("core.submit_candidate", "s1", script("flow: A")), call("core.submit_candidate", "s2", script("flow: B")), call("core.submit_candidate", "s3", script("flow: C")));

    await expect(run).rejects.toBe(stalledError);

    const warned = shownAt(decide, 3).find((entry) => entry.toolId === "core.refusal_run")?.value;
    expect(warned).toMatchObject({ code: "llm_evidence_loop.refused_in_a_row", inARow: 2 });
    expect(JSON.stringify(warned)).not.toContain("3fa2b1c9");
    expect(String(warned?.instruction)).toContain("flow_bootstrap.completion_refused");
    expect(String(warned?.instruction)).toContain("authoring.repeat.bound_inside_span at line 27");
  });
});
