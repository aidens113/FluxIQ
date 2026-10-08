// How a candidate build's ending reads in the chat (t362, lane A round 4,
// `run-muyrpbnk-fef374e7`, C6): a build stopped for no progress said "the
// model's answer could not be used", and that the Flow "has no steps yet" over
// a kept draft that had been test-run twice. Each cause is named in plain
// words, and what was kept is said as it is, with no revision number, id or
// code.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "../catalog.ts";
import { automationStudioConversationCandidateKeptSaid } from "../build.ts";
import { executeAutomationStudioConversationCommand } from "../execute.ts";
import { automationStudioConversationCallCause } from "../progress.ts";
import { automationStudioConversationCommandWork } from "../work.ts";

const PROJECT = "project.candidate-endings";
const DIGEST = "a".repeat(64);

/** The chat's cause for a failed build whose diagnostic is `diagnostic`. */
function cause(diagnostic: Record<string, unknown>): string {
  return automationStudioConversationCallCause("the build", { ok: false, error: "Flow Bootstrap generation failed.", payload: { diagnostic } });
}

/** Nothing a person never sees: a revision, a candidate id, a digest or a dotted code. */
function expectPlain(text: string): void {
  expect(text).not.toMatch(/revision|candidate|\b[a-z]+_[a-z_]+\b|\b[a-z]+\.[a-z_]+\.[a-z_]+\b/iu);
  expect(text).not.toContain(DIGEST);
}

describe("each candidate ending names its real cause", () => {
  it("no progress, unusable replies, budgets and allowances each have their own words", () => {
    const loop = { iterationCount: 30, decisionCount: 30, toolCallCount: 20, evidenceBytes: 1 };
    const said = {
      noProgress: cause({ code: "flow_bootstrap.evidence_repeat_without_progress", stage: "provider_output_validation" }),
      unusable: cause({ code: "flow_bootstrap.evidence_unusable_decision", stage: "provider_output_validation" }),
      unreadable: cause({ code: "flow_bootstrap.provider_response_malformed", stage: "provider_output_validation" }),
      cost: cause({ code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", evidenceLoop: { ...loop, exhausted: { bound: "budget", budgetBound: "cost" } } }),
      duration: cause({ code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", evidenceLoop: { ...loop, exhausted: { bound: "budget", budgetBound: "duration" } } }),
      calls: cause({ code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", evidenceLoop: { ...loop, exhausted: { bound: "budget", budgetBound: "calls" } } }),
      decisions: cause({ code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", evidenceLoop: { ...loop, exhausted: { bound: "iterations" } } }),
      steps: cause({ code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", evidenceLoop: { ...loop, exhausted: { bound: "tool_calls" } } }),
      evidence: cause({ code: "flow_bootstrap.evidence_limit", stage: "provider_output_validation" })
    };
    expect(said).toEqual({
      noProgress: "the build failed: it kept trying without getting any further, so it was stopped",
      unusable: "the build failed: the model's answer could not be used",
      unreadable: "the build failed: the model's answer could not be used",
      cost: "the build failed: it reached its spending limit",
      duration: "the build failed: it ran out of time",
      calls: "the build failed: it reached the limit on how many times it may ask the model",
      decisions: "the build failed: it reached the limit on how many decisions it may make",
      steps: "the build failed: it reached the limit on how many steps it may try",
      evidence: "the build failed: it reached the limit on how much it may read from the page"
    });
    // Only an unusable reply is worded as one (round 4 said it of a no-progress stop).
    for (const [key, text] of Object.entries(said)) if (key !== "unusable" && key !== "unreadable") expect(text).not.toContain("could not be used");
    for (const text of Object.values(said)) expectPlain(text);
  });
});

describe("what a failed candidate build kept", () => {
  it("a kept draft is a draft, not 'no steps', and each trial verdict reads as what the test run came to", () => {
    const base = { candidateId: "candidate.7", revision: 7, digest: DIGEST };
    const sentences = {
      neverTested: automationStudioConversationCandidateKeptSaid({ ...base, draft: "saved", trialCount: 0, trials: [] }),
      twiceDidNotFinish: automationStudioConversationCandidateKeptSaid({ ...base, draft: "saved", trialCount: 2, trials: [{ revision: 2, verdict: "execution_failed", trialRunId: "trial.1", code: "web.target.not_found" }, { revision: 4, verdict: "execution_failed", trialRunId: "trial.2", code: "web.action.rate_limited" }] }),
      onceJudgedNo: automationStudioConversationCandidateKeptSaid({ ...base, draft: "saved", trialCount: 1, trials: [{ revision: 7, verdict: "no", trialRunId: "trial.1", code: "candidate.trial_judged_no" }] }),
      threeUnsure: automationStudioConversationCandidateKeptSaid({ ...base, draft: "saved", trialCount: 3, trials: [{ revision: 7, verdict: "unsure" }] }),
      notChecked: automationStudioConversationCandidateKeptSaid({ ...base, draft: "saved", trialCount: 1, trials: [{ revision: 7, verdict: "not_judged" }] }),
      notKept: automationStudioConversationCandidateKeptSaid({ ...base, draft: "none", trialCount: 0, trials: [] })
    };
    expect(sentences).toEqual({
      neverTested: "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. It was never test-run from the start.",
      twiceDidNotFinish: "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. A version of it was test-run from the start twice, and the last test run did not get to the end.",
      onceJudgedNo: "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. A version of it was test-run from the start once, and that test run was judged not to do what you asked.",
      threeUnsure: "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. A version of it was test-run from the start 3 times, and the last test run could not be confirmed to do what you asked.",
      notChecked: "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. A version of it was test-run from the start once, and that test run was not checked.",
      notKept: "The latest version of the Flow's steps that I wrote could not be kept, and nothing was put into the Flow. It was never test-run from the start."
    });
    for (const text of Object.values(sentences)) expectPlain(text ?? "");
    // A model that never wrote a version Core accepted kept nothing to speak of.
    expect(automationStudioConversationCandidateKeptSaid({ candidateId: "candidate.1", draft: "none", trialCount: 0, trials: [] })).toBeUndefined();
  });
});

describe("a failed candidate build in the chat", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool | undefined;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-candidate-endings-test-"));
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate");
  });
  afterEach(async () => {
    await automationStudioConversationCommandWork.idle();
    automationStudioConversationCommandWork.takeUnreported();
    if (pool) { await pool.closeAll(); pool = undefined; }
    await rm(rootDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function createHere(diagnostic: Record<string, unknown>): Promise<string> {
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const conversations = new AutomationStudioConversations(pool);
    const { conversationId } = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null, conversationId: "conversation.chat" });
    await conversations.appendTurn({ projectId: PROJECT, conversationId, text: "Put three hubs in the cart" });
    const answer = await conversations.appendAutomationTurn({ projectId: PROJECT, conversationId, text: "I'll make you a new automation for this.", ask: null, attachment: null });
    const handlers: Record<string, () => AutomationStudioConversationCommandCallResult> = {
      "create-flow": () => ({ ok: true, payload: { flow: { flowId: "flow.hub" } } }),
      "save-flow-generation-instruction": () => ({ ok: true }),
      "generate-flow-bootstrap-adaptation": () => ({ ok: false, error: "Flow Bootstrap generation failed.", payload: { diagnostic } })
    };
    const context: AutomationStudioConversationCommandContext = { port: { call: async (endpoint) => handlers[endpoint]?.() ?? { ok: false, error: `No fake for ${endpoint}.` } },
      host: conversations, projectId: PROJECT, conversationId, sessionId: "session.person", keyLocked: false, paired: false, startLocation: "https://shop.example/hub", answerTurnId: answer.turnId };
    const command = AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get("flow.createHere");
    if (!command) throw new Error("no create-here command");
    await executeAutomationStudioConversationCommand({ command, context, arguments: { instruction: "Put three hubs in the cart", name: "Hubs" } });
    await automationStudioConversationCommandWork.idle();
    const turns = (await conversations.getConversation({ projectId: PROJECT, conversationId }))?.turns ?? [];
    return turns.at(-1)?.text ?? "";
  }

  it("round 4's ending: no progress, with the kept draft and its two test runs, and never 'no steps yet'", async () => {
    const text = await createHere({ code: "flow_bootstrap.evidence_repeat_without_progress", stage: "provider_output_validation",
      candidate: { candidateId: "candidate.4a", draft: "saved", revision: 7, digest: DIGEST, trialCount: 2,
        trials: [{ revision: 2, verdict: "execution_failed", trialRunId: "trial.1", code: "web.target.not_found" }, { revision: 4, verdict: "execution_failed", trialRunId: "trial.2", code: "web.action.rate_limited" }] } });
    expect(text).toBe("\"Create an automation here\" stopped because the build failed: it kept trying without getting any further, so it was stopped. "
      + "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow. A version of it was test-run from the start twice, and the last test run did not get to the end. "
      + "The Flow \"Hubs\" keeps your instruction, so you can build it again.");
    expect(text).not.toContain("no steps yet");
    expect(text).not.toContain("could not be used");
    expect(text).not.toMatch(/revision|candidate\.|trial\.|web\./iu);
  });

  it("a build that never had a version accepted still says the Flow has no steps", async () => {
    const text = await createHere({ code: "flow_bootstrap.evidence_unusable_decision", stage: "provider_output_validation", candidate: { candidateId: "candidate.4a", draft: "none", trialCount: 0, trials: [] } });
    expect(text).toContain("the build failed: the model's answer could not be used.");
    expect(text).toContain('The Flow "Hubs" has no steps yet, but it keeps your instruction, so you can build it again.');
  });
});
