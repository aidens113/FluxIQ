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
//
// A host may keep more turns than the card's default (`window`), and the
// person may ask for every turn (`window: ALL_TURNS`): that read starts from
// the thread's start and goes up to `ALL_PAGES` pages, so a long thread is
// still read in bounded pages. The read also counts the turns it left off
// the top, so "Show 12 earlier turns" can say how many.

import type { ChatConversationPort, ChatResult } from "../ports/index.ts";
import { parseThreadPage, type CoreTurn } from "./core-thread.ts";
import { UNREADABLE_CODE } from "./read/index.ts";

/** The most turns kept on screen. The card shows about three and scrolls for the rest. */
export const TURN_WINDOW = 20;

/** The window of a read of every turn: nothing falls off the top. */
export const ALL_TURNS = Number.POSITIVE_INFINITY;

const PAGE_LIMIT = 50;
const MAX_PAGES = 10;
/** The most pages one read of every turn takes. */
const ALL_PAGES = 100;

/** What one read found. */
export type ThreadTail = {
  turns: CoreTurn[];
  /** The turn just before `turns[0]`, to read from next time; undefined means from the start. */
  anchorTurnId: string | undefined;
  /** False when the read stopped at `MAX_PAGES` before reaching the end. */
  complete: boolean;
  /** True when Core says the thread no longer exists. */
  missing: boolean;
  /** How many turns come before `turns[0]`, when that is known. */
  earlier: number | undefined;
};

/** Where to read: which thread, in which project, from which anchor. */
export type ThreadTailTarget = {
  conversationId: string;
  projectId: string;
  anchorTurnId: string | undefined;
  requireIdentity?: boolean;
  /** Turns kept; `TURN_WINDOW` when absent. */
  window?: number;
  /** How many turns come before the anchor, when the caller knows. */
  earlier?: number | undefined;
};

/** Reads the end of `target`'s thread. A failed answer comes back as it failed; an unreadable one as `code: "unreadable"`. */
export async function readThreadTail(readThread: ChatConversationPort["readThread"], target: ThreadTailTarget): Promise<ChatResult<ThreadTail>> {
  let since = target.anchorTurnId;
  let anchorTurnId = target.anchorTurnId;
  let turns: CoreTurn[] = [];
  const kept = target.window ?? TURN_WINDOW;
  const pages = kept === ALL_TURNS ? ALL_PAGES : MAX_PAGES;
  // From the start nothing comes before the first turn.
  let earlier = target.anchorTurnId === undefined ? 0 : target.earlier;
  for (let page = 0; page < pages; page += 1) {
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
      return { ok: true, value: { turns: [], anchorTurnId: undefined, complete: true, missing: true, earlier: undefined } };
    }
    if (thread === undefined) {
      return { ok: false, sentence: "FluxIQ answered with a conversation this panel can't read.", code: UNREADABLE_CODE };
    }
    if (target.requireIdentity && (thread.conversation.projectId !== target.projectId || thread.conversation.conversationId !== target.conversationId)) {
      return { ok: false, sentence: "FluxIQ answered with a different conversation than this chat requested.", code: UNREADABLE_CODE };
    }
    turns.push(...thread.turns);
    if (turns.length > kept) {
      anchorTurnId = turns[turns.length - kept - 1]!.turnId;
      if (earlier !== undefined) earlier += turns.length - kept;
      turns = turns.slice(-kept);
    }
    const last = thread.turns[thread.turns.length - 1];
    if (!thread.hasMore || last === undefined) {
      return { ok: true, value: { turns, anchorTurnId, complete: true, missing: false, earlier } };
    }
    since = last.turnId;
  }
  return { ok: true, value: { turns, anchorTurnId, complete: false, missing: false, earlier } };
}
