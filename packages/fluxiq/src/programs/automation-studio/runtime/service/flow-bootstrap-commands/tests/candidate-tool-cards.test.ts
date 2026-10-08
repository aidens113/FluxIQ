// A candidate build's own two tools as cards in the chat (t373). The authoring
// loop ran `core.submit_candidate` and `core.test_candidate` outside the
// activity observer, so the chat showed no card for saving the Flow's steps or
// for testing it, and the overlay had to infer a trial from other rows (t366).
// Through the actual service: a refused submission, an accepted one, a judged
// trial, then completion.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** What a card or a status sentence may never say: a tool's name or id, a revision, a digest. */
const INTERNAL = /submit[_ ]candidate|test[_ ]candidate|core\.|revision|digest|\bcandidate\b|[0-9a-f]{16,}/iu;

async function candidateBuild() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-tool-cards-"));
  let decisions = 0;
  const digests: string[] = [];
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    decisions++;
    const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    if (typeof latest?.digest === "string") digests.push(latest.digest);
    const refused = { ...plan(), subflows: [{ ...plan().subflows[0]!, nodes: [{ key: "start", definitionId: "missing.node", definitionVersion: "1.0.0" }] }] };
    const decision = decisions === 1 ? { kind: "tool_call", callId: "submit-1", toolId: "core.submit_candidate", input: { summary: "Start to End", plan: refused } }
      : decisions === 2 ? { kind: "tool_call", callId: "submit-2", toolId: "core.submit_candidate", input: { summary: "Start to End", plan: plan() } }
      : decisions === 3 ? { kind: "tool_call", callId: "test-1", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } };
    return { response: { kind: "evidence_tool_decision", summary: "Scripted", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) } });
  cleanups.push(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const { project, flow } = await blankFixture(service);
  const events: ClientGatewayActivity[] = [];
  const unsubscribe = automationStudioActivityHub.subscribe((event) => { if (event.subject.kind === "build") events.push(event); });
  const result = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" }).finally(unsubscribe);
  return { result, events, digests };
}

/** Everything a person reads of a row: its status sentence, its title and its card. */
function readable(event: ClientGatewayActivity): string {
  const card = activityActionOf(event);
  return [event.label, event.detail?.title, card?.target, card?.why, card?.result, card?.refused?.because].filter(Boolean).join(" | ");
}

describe("a candidate build's own tools in the chat", () => {
  it("each submission and each test is a card with plain words, and the test's card brackets its run", async () => {
    const { result, events, digests } = await candidateBuild();
    expect(result.status).toBe("proposed");
    const rows = (ref: string) => events.filter((event) => event.detail?.kind === "tool" && event.detail.ref === ref);

    // Two submissions: each opens a card and closes it, the first declined with what to fix, the second accepted.
    const submits = rows("core.submit_candidate");
    expect(submits.map((event) => event.detail?.status)).toEqual(["started", "failed", "started", "succeeded"]);
    expect(submits.map((event) => event.detail?.title)).toEqual(Array(4).fill("Saving the Flow's steps"));
    const refused = activityActionOf(submits[1]!);
    expect(refused).toMatchObject({ kind: "draft", outcome: "failed", refused: { all: true } });
    expect(refused?.refused?.because).toMatch(/^some steps weren't written in a way the Flow can run/u);
    expect(submits[1]!.label).toBe("Saving the Flow's steps — not done");
    expect(activityActionOf(submits[3]!)).toMatchObject({ kind: "draft", outcome: "done", result: "the steps were accepted" });

    // One test: its card opens before the trial's first step and closes after its last, with the gate's code first on its record (the overlay reads it).
    const tests = rows("core.test_candidate");
    expect(tests.map((event) => event.detail?.status)).toEqual(["started", "succeeded"]);
    const opened = events.indexOf(tests[0]!), closed = events.indexOf(tests[1]!);
    const steps = events.map((event, index) => (event.step !== undefined ? index : -1)).filter((index) => index >= 0);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((index) => index > opened && index < closed)).toBe(true);
    expect(tests[1]!.detail?.text).toMatch(/^Result:\s*candidate\.trial_yes\b/u);
    const passed = activityActionOf(tests[1]!);
    expect(passed).toMatchObject({ kind: "test", outcome: "done" });
    expect(passed?.result).toMatch(/^the test passed and the Flow did what you asked: \d+ steps? done$/u);
    expect(tests[1]!.label).toBe("Testing the whole Flow from the start — passed");

    // No card, title or status sentence names a tool, a revision or a digest.
    expect(digests.length).toBeGreaterThan(0);
    for (const event of [...submits, ...tests]) {
      const said = readable(event);
      expect(said).not.toMatch(INTERNAL);
      for (const digest of digests) expect(said).not.toContain(digest);
    }
  });
});
