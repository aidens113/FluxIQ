// The end of a thread: the last few turns, read from Core.
//
// Core's `get-conversation` pages forward from the start, or from after
// `sinceTurnId`. The card wants the end, so it reads forward from an anchor --
// the turn just before the first one on screen -- and keeps only the last
// `TURN_WINDOW` turns it sees, moving the anchor up as older turns fall off.
// Every read replaces what is on screen with Core's answer from the anchor on,
// so an ask answered elsewhere shows as answered; nothing is merged locally.
//
// A thread longer than `MAX_PAGES` pages is read in steps: the read reports
// itself incomplete, and the next one carries on from the new anchor.

import type { ChatConversationPort, ChatResult } from "../ports/index.ts";
import { parseThreadPage, type CoreTurn } from "./core-thread.ts";
import { UNREADABLE_CODE } from "./read/index.ts";

/** The most turns kept on screen. The card shows about three and scrolls for the rest. */
export const TURN_WINDOW = 20;

const PAGE_LIMIT = 50;
const MAX_PAGES = 10;

/** What one read found. */
export type ThreadTail = {
  turns: CoreTurn[];
  /** The turn just before `turns[0]`, to read from next time; undefined means from the start. */
  anchorTurnId: string | undefined;
  /** False when the read stopped at `MAX_PAGES` before reaching the end. */
  complete: boolean;
  /** True when Core says the thread no longer exists. */
  missing: boolean;
};

/** Where to read: which thread, in which project, from which anchor. */
export type ThreadTailTarget = { conversationId: string; projectId: string; anchorTurnId: string | undefined; requireIdentity?: boolean };

/** Reads the end of `target`'s thread. A failed answer comes back as it failed; an unreadable one as `code: "unreadable"`. */
export async function readThreadTail(readThread: ChatConversationPort["readThread"], target: ThreadTailTarget): Promise<ChatResult<ThreadTail>> {
  let since = target.anchorTurnId;
  let anchorTurnId = target.anchorTurnId;
  let turns: CoreTurn[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await readThread({
      projectId: target.projectId,
      conversationId: target.conversationId,
      sinceTurnId: since,
      limit: PAGE_LIMIT
    });
    if (!result.ok) {
      return result;
    }
    const thread = parseThreadPage(result.value.conversation);
    if (thread === null) {
      return { ok: true, value: { turns: [], anchorTurnId: undefined, complete: true, missing: true } };
    }
    if (thread === undefined) {
      return { ok: false, sentence: "FluxIQ answered with a conversation this panel can't read.", code: UNREADABLE_CODE };
    }
    if (target.requireIdentity && (thread.conversation.projectId !== target.projectId || thread.conversation.conversationId !== target.conversationId)) {
      return { ok: false, sentence: "FluxIQ answered with a different conversation than this chat requested.", code: UNREADABLE_CODE };
    }
    turns.push(...thread.turns);
    if (turns.length > TURN_WINDOW) {
      anchorTurnId = turns[turns.length - TURN_WINDOW - 1]!.turnId;
      turns = turns.slice(-TURN_WINDOW);
    }
    const last = thread.turns[thread.turns.length - 1];
    if (!thread.hasMore || last === undefined) {
      return { ok: true, value: { turns, anchorTurnId, complete: true, missing: false } };
    }
    since = last.turnId;
  }
  return { ok: true, value: { turns, anchorTurnId, complete: false, missing: false } };
}
