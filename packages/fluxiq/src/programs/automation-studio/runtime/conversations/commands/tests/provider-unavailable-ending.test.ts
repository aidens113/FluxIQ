// What "automate this" answers when its build ended because the AI model
// provider answered nothing (t619), in both authoring modes: Core's ending,
// whole, then the Flow's state, and the instruction said to be kept once. The
// ending's own words say it is kept and that the person can try again later
// (`flow-bootstrap/generation-failure/loop-provider-unavailable.ts`), so the
// command's "keeps your instruction, so you can build it again" is not said
// after them a second time.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { flowBootstrapEvidenceLoopFailure } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "../catalog.ts";
import { executeAutomationStudioConversationCommand } from "../execute.ts";
import { automationStudioConversationCommandWork } from "../work.ts";

const PROJECT = "project.provider-silent";
type Mode = "candidate" | "project";

/** A loop whose three decisions all timed out, with nothing arriving, as `llm/evidence-loop.ts` returns it. */
const SILENT: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }> = {
  ok: false, code: "llm_evidence_loop.provider_unavailable", steps: [],
  trace: [1, 2, 3].map((iteration) => ({ iteration, decision: "unusable" as const, resultCode: "llm.provider_timeout" })),
  accounting: { iterations: 3, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  providerUnavailable: { inARow: 3, codes: ["llm.provider_timeout"], said: "it did not answer before the time allowed for each request ran out", replied: false }
};

/** What the project build adds after its ending when no act of the build is left on the target (`service/project-build/run.ts`). */
const NOTHING_LEFT = "Nothing this build did is still on the target.";

/** Each mode's failed build, as the service publishes it (`service/tests/provider-unavailable-authoring-modes.test.ts` pins the same words end to end). */
function diagnosticOf(mode: Mode): Record<string, unknown> {
  if (mode === "candidate") return { ...flowBootstrapEvidenceLoopFailure(SILENT).diagnostic };
  const diagnostic = flowBootstrapEvidenceLoopFailure(SILENT, undefined, undefined, "said_by_caller").diagnostic;
  return { ...diagnostic, ending: { ...diagnostic.ending!, message: `${diagnostic.ending!.message} ${NOTHING_LEFT}` } };
}

/** The whole answer, by mode. */
const ANSWER: Readonly<Record<Mode, string>> = {
  candidate: "The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out. "
    + "Nothing was built: no Flow was created or changed, and nothing on the page was changed. What the Flow should do is kept, so you can try again later, once the provider is answering. "
    + "The Flow \"Hubs\" has no steps yet.",
  project: "The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out. "
    + "Nothing was built: no Flow was created or changed. What the Flow should do is kept, so you can try again later, once the provider is answering. Nothing this build did is still on the target. "
    + "The Flow \"Hubs\" has no steps yet."
};

describe.each<Mode>(["candidate", "project"])("automate this, when a %s build's model provider answered nothing", (mode) => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool | undefined;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-provider-silent-test-"));
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", mode);
  });
  afterEach(async () => {
    await automationStudioConversationCommandWork.idle();
    automationStudioConversationCommandWork.takeUnreported();
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
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
      "generate-flow-bootstrap-adaptation": () => ({ ok: false, error: `Flow Bootstrap generation failed (${String(diagnostic.code)}).`, payload: { diagnostic } })
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

  it("answers with Core's ending whole, then the Flow's state, saying the instruction is kept once", async () => {
    const text = await createHere(diagnosticOf(mode));
    expect(text).toBe(ANSWER[mode]);
    expect(text.match(/kept/gu)).toHaveLength(1);
    expect(text).not.toContain("keeps your instruction");
    expect(text).not.toContain("what the model wrote");
    expect(text).not.toContain("supervisor");
  });

  it("still says the instruction is kept after an ending that does not say it", async () => {
    const text = await createHere({ code: "flow_bootstrap.evidence_unusable_decision", stage: "provider_output_validation" });
    expect(text).toContain('The Flow "Hubs" has no steps yet, but it keeps your instruction, so you can build it again.');
  });
});
