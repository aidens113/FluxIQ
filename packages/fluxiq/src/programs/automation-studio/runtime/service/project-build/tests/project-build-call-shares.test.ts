// Three builders sharing one 64-call build (t570): Core sizes each brief's
// share of the calls and money (`project-agents/supervisor/brief-sizing.ts`),
// the dispatcher carves each share from the build's purse
// (`./brief-calls.ts`, `llm/build-purse/`), and each real builder loop counts
// its own allowance's calls, wraps up inside its share and submits; the calls
// kept for assembly, the reset and the judged whole run are still there after.
// The model is a script that explores until its budget says it is wrapping up.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialPort } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import { automationStudioLlmCurrentBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { automationStudioProjectSupervisorBriefSizing, type AutomationStudioProjectBuilderPorts, type AutomationStudioProjectSubflowBrief } from "../../../project-agents/index.ts";
import { gardenBrief, gardenBuild, REF } from "../../../project-agents/dispatch/tests/dispatch-fixture.ts";
import { automationStudioProjectBuildBriefCalls } from "../brief-calls.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS, AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE } from "../reserve.ts";

type Entry = { callId: string; toolId: string; value: unknown };

/** What each builder writes, by subflow: the router-run one outside every block, the callable ones as their part. */
const SCRIPTS: Record<string, string> = {
  list_seeds: ["flow: List the seeds", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://garden.test/seeds"].join("\n"),
  open_packet: ["flow: Open the packet", "part open_packet: open the packet page", "  input: packet", "  step: open the packet", "    node: web.browser.navigate", "    url: https://garden.test/packet", "end"].join("\n"),
  plant_packet: ["flow: Plant the packet", "part plant_packet: add the packet to the list", "  input: packet", "  step: open the list", "    node: web.browser.navigate", "    url: https://garden.test/list", "end"].join("\n")
};

const look: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object", properties: { at: { type: "integer" } } } };

/** One provider call, held on the allowance the brief runs under and settled, as the harness holds a real one. */
function spendCall(judge = false): void {
  const purse = automationStudioLlmCurrentBuildPurse();
  if (!purse) throw new Error("no purse in scope");
  const held = purse.hold({ projectedCostUsd: 0.0005, estimatedInputTokens: 100, maxOutputTokens: 50, ...(judge ? { judge: true } : {}) });
  if (!held.ok) throw new Error(`refused: ${held.refusal.code}`);
  held.hold.settle({ estimatedCostUsd: 0.0004 });
}

const latest = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;

describe("three builders on one 64-call build", () => {
  it("each gets a share of the calls, wraps up and submits inside it, and calls remain for assembly and the whole trial", async () => {
    const shown: Record<string, string> = {};
    const budgets: Record<string, JsonObject[]> = {};
    const builder = (request: { brief: AutomationStudioProjectSubflowBrief }): AutomationStudioProjectBuilderPorts => {
      const key = request.brief.subflowKey;
      let looks = 0;
      const trial: AutomationStudioSubflowTrialPort = async (asked) => {
        // A trial's judge asks twice: a first answer and its confirmation, both on the brief's share.
        spendCall(true);
        spendCall(true);
        return { partial: true, scope: "subflow", identity: { ...asked.proposal.scope }, revision: asked.proposal.revision, digest: asked.proposal.digest, verdict: "yes", feedback: {}, trialRunId: `run.${key}`, entryPrepared: true };
      };
      return {
        loop: {
          tools: [look], maxToolCalls: 30,
          unusableDecisions: { maxConsecutive: 5, maxInARow: 5, stalled: () => new Error("stalled") },
          executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "the catalogue" }, effectApplied: false, targetsUnchanged: true }),
          decide: async ({ evidence }) => {
            spendCall();
            const budget = latest(evidence, "core.budget");
            if (budget) (budgets[key] ??= []).push(budget);
            const wrapping = budget !== undefined && (budget.decisionsLeft as number) <= 5;
            const submitted = latest(evidence, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID);
            const tested = latest(evidence, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID);
            if (!wrapping) return { kind: "tool_call", toolId: look.toolId, callId: `look.${key}.${++looks}`, input: { at: looks } };
            if (!submitted) return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: `submit.${key}`, input: { flow: SCRIPTS[key]! } };
            const receipt = { revision: submitted.revision as number, digest: submitted.digest as string };
            if (!tested) return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: `test.${key}`, input: receipt };
            return { kind: "complete", result: { subflowKey: key, ...receipt } };
          }
        },
        submission: testSubmission(),
        trial,
        observe: (loop: AutomationStudioLlmEvidenceLoopInput) => {
          shown[key] = loop.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.description;
          return loop;
        }
      };
    };
    const build = await gardenBuild({
      capacity: 1, maxCalls: 64, ceilingUsd: 0.25,
      ports: { builder },
      briefs: async ({ store, purse }) => {
        purse.keepBackForJudging({ calls: AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.calls, unpriced: { ...AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.unpriced } });
        purse.keepBackCallsFromAllowances(AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.supervisorCalls + AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.resetCalls);
        // The supervisor's own planning decisions, before it dispatches.
        for (let call = 0; call < 3; call += 1) {
          const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 100, maxOutputTokens: 50 });
          if (held.ok) held.hold.settle({ estimatedCostUsd: 0.001 });
        }
        const structure = (await store.read(REF))!.record.plans.at(-1)!.plan;
        // Sent with no money, no turns and no permitted acts: Core sizes them and permits their parts' acts.
        const sent: JsonObject[] = [{ kind: "build", subflowKey: "list_seeds" }, { kind: "build", subflowKey: "open_packet" }, { kind: "build", subflowKey: "plant_packet" }];
        const sizing = automationStudioProjectSupervisorBriefSizing({ sent, purse, structure, done: new Set(), supervisorCalls: AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.supervisorCalls });
        if (!sizing.ok) throw new Error(`sizing refused: ${JSON.stringify(sizing)}`);
        const keys = ["list_seeds", "open_packet", "plant_packet"];
        return keys.map((key, index) => gardenBrief(`b-${key}`, key, index ? [keys[index - 1]!] : [], (brief) => {
          const size = sizing.sizes[index]!;
          brief.allowanceUsd = size.allowanceUsd;
          brief.maxIterations = size.maxIterations;
          brief.maxCalls = size.maxCalls!;
        }));
      }
    });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    build.dispatcherInput.maxCalls = automationStudioProjectBuildBriefCalls;
    // 64 calls, 3 spent planning, 4 kept for judging the whole run, 10 for the build's own finishing: 47 over three briefs and one finishing share.
    const share = Math.floor((64 - 3 - 4 - 10) / 4);
    expect(build.briefs.map((brief) => brief.maxCalls)).toEqual([share, share, share]);
    expect(build.briefs.every((brief) => brief.allowanceUsd * 3 <= build.purse.allocatableUsd() + 1e-9)).toBe(true);
    const { returns } = await build.run();
    expect(returns.map((returned) => [returned.briefId, returned.outcome]), JSON.stringify(returns)).toEqual([["b-list_seeds", "done"], ["b-open_packet", "done"], ["b-plant_packet", "done"]]);
    for (const returned of returns) {
      // Each submitted and was tried inside its own share, with its trial's two judge calls.
      expect(returned.proposal).toBeDefined();
      expect(returned.trials).toHaveLength(1);
      expect(returned.calls).toBeLessThanOrEqual(share);
    }
    // The wrap-up came from the calls: the budget note named them, and the first one already counted fewer decisions than turns.
    for (const key of ["list_seeds", "open_packet", "plant_packet"]) {
      const first = budgets[key]![0]!;
      expect(first.callsLeft).toBeLessThanOrEqual(share);
      expect(first.decisionsLeft as number).toBeLessThan(share);
    }
    const spent = build.purse.attributedSpend();
    expect(spent.map((entry) => [entry.briefId, entry.closed])).toEqual([["b-list_seeds", true], ["b-open_packet", true], ["b-plant_packet", true]]);
    // What the build keeps for its finishing and the judged whole run is still there: a reset can be carved, and the judging fits.
    const left = build.purse.unspentCalls()!;
    expect(left).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.calls + AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.supervisorCalls + AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.resetCalls);
    expect(build.purse.judgingFits()).toBe(true);
    const reset = build.purse.allowance({ briefId: "b-reset", role: "builder", usd: 0.001, maxCalls: AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS.resetCalls, fromKeptBack: true });
    expect(reset.ok).toBe(true);
    // A callable builder's brief shows the exact lines its part declares, by name.
    expect(shown.open_packet).toContain("part open_packet: <what it does>\n  input: packet\n");
    expect(shown.open_packet).toContain("\"Open the first packet's page\"");
    expect(shown.list_seeds).toContain("The router runs it, so it takes no inputs and hands back no outputs");
  });
});
