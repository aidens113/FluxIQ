// Every turn of a thread reaches a model that reads it (`../whole-thread.ts`).
//
// The user's order of 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." The chat's instruction
// reader showed the model the last 20 turns, each cut at 1,500 characters, and a
// recovery read the first 40.

import { describe, expect, it } from "vitest";
import { automationStudioRecoveryConversationTurns } from "../../recovery/index.ts";
import { automationStudioConversationModelTranscript } from "../instructions/index.ts";
import type { AutomationStudioConversationTurn } from "../turn.ts";
import { automationStudioConversationWholeThread } from "../whole-thread.ts";

const TURNS = 450;

function turn(index: number): AutomationStudioConversationTurn {
  return { turnId: `turn.${index}`, ordinal: index, author: index % 2 ? "person" : "automation", text: `Turn ${index}: ${"keep only the Plus ones ".repeat(100)}`.trim(), attachment: null } as unknown as AutomationStudioConversationTurn;
}

const thread = Array.from({ length: TURNS }, (_unused, index) => turn(index + 1));

/** A store that pages the way the real one does: at most `limit` turns after `sinceTurnId`, and whether there is more. */
async function page(input: { limit: number; sinceTurnId?: string }) {
  const since = input.sinceTurnId === undefined ? 0 : thread.findIndex((item) => item.turnId === input.sinceTurnId) + 1;
  const limit = Math.min(input.limit, 200);
  return { turns: thread.slice(since, since + limit), hasMore: since + limit < thread.length };
}

describe("a thread a model reads", () => {
  it("is read whole, page after page, however long", async () => {
    const turns = await automationStudioConversationWholeThread(page, "conversation.one");
    expect(turns.map((item) => item.turnId)).toEqual(thread.map((item) => item.turnId));
  });

  it("is empty for a thread that does not exist", async () => {
    expect(await automationStudioConversationWholeThread(async () => null, "conversation.none")).toEqual([]);
  });

  it("reaches the chat's instruction reader every turn, each whole, but the one being answered", () => {
    const transcript = automationStudioConversationModelTranscript(thread, "turn.450");
    expect(transcript).toHaveLength(TURNS - 1);
    expect(transcript.map((item) => item.text)).toEqual(thread.slice(0, -1).map((item) => item.text));
  });

  it("reaches a recovery every turn, not the first forty", async () => {
    const turns = await automationStudioRecoveryConversationTurns({
      listConversations: async (input) => input.subject?.kind === "run" ? [{ conversationId: "conversation.run" } as never] : [],
      getConversation: async (input) => page({ limit: input.limit ?? 200, ...(input.sinceTurnId === undefined ? {} : { sinceTurnId: input.sinceTurnId }) })
    }, { projectId: "project.one", flowId: "flow.one", runId: "run.one" });
    expect(turns).toHaveLength(TURNS);
    expect(turns.at(-1)?.turnId).toBe("turn.450");
  });
});
