import { describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_POLL_CEILING_MS,
  CONVERSATION_POLL_FAST_MS,
  CONVERSATION_POLL_HIDDEN_MS,
  createBackoffPoller,
  nextConversationPollDelayMs
} from "../thread";
import {
  parseConversation,
  parseConversationTurn,
  parseConversationTurns
} from "../thread";
import {
  conversationFollowsTail,
  conversationSubjectLabel,
  latestConversationTurnId,
  mergeConversationTurns,
  pendingConversationTurn,
  sortConversationsForThreadList,
  visibleConversationTurns
} from "../thread";
import { openConversationsFromPayload, promptableConversationTurn, withDismissedAsk } from "../thread";
import { conversationAnswerNeedsReauthorization, conversationAskPresentation } from "../thread";

function wireTurn(overrides: Record<string, unknown> = {}) {
  return {
    turnId: "turn.1",
    conversationId: "conversation.1",
    author: "automation",
    createdAt: 1_790_000_000_000,
    text: "Reading the page.",
    ...overrides
  };
}

function wireAsk(overrides: Record<string, unknown> = {}) {
  return {
    askId: "ask.1",
    kind: "permission",
    status: "pending",
    parks: true,
    missing: ["send_or_publish", "create_new"],
    control: { name: "Add to queue", kind: "button" },
    ...overrides
  };
}

describe("conversation turn contract", () => {
  it("reads exactly what Core built, and refuses a record it did not", () => {
    const turn = parseConversationTurn(wireTurn({ ask: wireAsk(), attachment: { kind: "flow-graph-diff", ref: "adaptation:a.1" } }));
    expect(turn?.author).toBe("automation");
    expect(turn?.ask?.missing).toEqual(["send_or_publish", "create_new"]);
    expect(turn?.ask?.control).toEqual({ name: "Add to queue", kind: "button" });
    expect(turn?.attachment).toEqual({ kind: "flow-graph-diff", ref: "adaptation:a.1" });

    expect(parseConversationTurn(wireTurn({ author: "assistant" }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ surprise: 1 }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ text: "line\u0007bell" }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ createdAt: -1 }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ ask: wireAsk({ missing: ["set_the_house_on_fire"] }) }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ ask: wireAsk({ status: "maybe" }) }))).toBeNull();
    expect(parseConversationTurn(wireTurn({ attachment: { kind: "flow-graph-diff" } }))).toBeNull();
  });

  it("drops only the record it could not read", () => {
    const turns = parseConversationTurns([wireTurn(), { turnId: "not a turn" }, wireTurn({ turnId: "turn.2" })]);
    expect(turns.map((turn) => turn.turnId)).toEqual(["turn.1", "turn.2"]);
    expect(parseConversationTurns(undefined)).toEqual([]);
  });

  it("reads a conversation and refuses an unknown subject", () => {
    const conversation = parseConversation({
      conversationId: "conversation.1",
      projectId: "project.one",
      subject: { kind: "run", id: "run.7" },
      status: "open",
      createdAt: 1,
      updatedAt: 2
    });
    expect(conversation?.subject).toEqual({ kind: "run", id: "run.7" });
    expect(conversationSubjectLabel(conversation!)).toBe("Run run.7");
    expect(parseConversation({
      conversationId: "conversation.1",
      projectId: "project.one",
      subject: { kind: "galaxy", id: "g.1" },
      status: "open",
      createdAt: 1,
      updatedAt: 2
    })).toBeNull();
  });
});

describe("conversation transcript", () => {
  const turn = (turnId: string, createdAt: number, ask?: Record<string, unknown>) =>
    parseConversationTurn(wireTurn({ turnId, createdAt, ...(ask ? { ask } : {}) }))!;

  it("appends without rewriting what the person already read", () => {
    const held = [turn("turn.b", 20), turn("turn.a", 10)];
    const merged = mergeConversationTurns(held, [turn("turn.c", 30), { ...turn("turn.a", 10), text: "rewritten" }]);
    expect(merged.map((entry) => entry.turnId)).toEqual(["turn.a", "turn.b", "turn.c"]);
    expect(merged[0]?.text).toBe("Reading the page.");
    expect(latestConversationTurnId(merged)).toBe("turn.c");
    expect(latestConversationTurnId([])).toBeNull();
  });

  it("orders two turns written in the same millisecond stably", () => {
    const merged = mergeConversationTurns([], [turn("turn.z", 10), turn("turn.a", 10)]);
    expect(merged.map((entry) => entry.turnId)).toEqual(["turn.a", "turn.z"]);
  });

  it("offers only the newest question still waiting", () => {
    const turns = [
      turn("turn.1", 10, wireAsk({ askId: "ask.old", status: "answered" })),
      turn("turn.2", 20, wireAsk({ askId: "ask.new" })),
      turn("turn.3", 30)
    ];
    expect(pendingConversationTurn(turns)?.ask?.askId).toBe("ask.new");
    expect(pendingConversationTurn([turn("turn.1", 10)])).toBeNull();
  });

  it("mounts a bounded tail and keeps the rest behind one control", () => {
    const turns = Array.from({ length: 5_000 }, (_, index) => turn(`turn.${index}`, index));
    const windowed = visibleConversationTurns(turns, false);
    expect(windowed.turns).toHaveLength(200);
    expect(windowed.hidden).toBe(4_800);
    expect(windowed.turns[199]?.turnId).toBe("turn.4999");
    expect(visibleConversationTurns(turns, true).turns).toHaveLength(5_000);
  });

  it("follows its tail only when the person is already at the bottom", () => {
    expect(conversationFollowsTail({ scrollTop: 900, scrollHeight: 1_000, clientHeight: 100 })).toBe(true);
    expect(conversationFollowsTail({ scrollTop: 860, scrollHeight: 1_000, clientHeight: 100 })).toBe(true);
    expect(conversationFollowsTail({ scrollTop: 400, scrollHeight: 1_000, clientHeight: 100 })).toBe(false);
  });

  it("opens the list on live work", () => {
    const base = { conversationId: "c", projectId: "p", subject: { kind: "project" as const, id: "p" }, createdAt: 0 };
    const sorted = sortConversationsForThreadList([
      { ...base, conversationId: "c.resolved", status: "resolved", updatedAt: 99 },
      { ...base, conversationId: "c.old", status: "open", updatedAt: 1 },
      { ...base, conversationId: "c.new", status: "open", updatedAt: 5 }
    ]);
    expect(sorted.map((entry) => entry.conversationId)).toEqual(["c.new", "c.old", "c.resolved"]);
  });
});

describe("conversation reachability", () => {
  it("decays from the fast beat to the ceiling, and snaps back when something is pending", () => {
    let delay = CONVERSATION_POLL_FAST_MS;
    const seen: number[] = [];
    for (let step = 0; step < 8; step += 1) {
      delay = nextConversationPollDelayMs(delay, "idle");
      seen.push(delay);
    }
    expect(seen[0]).toBe(1_600);
    expect(seen.at(-1)).toBe(CONVERSATION_POLL_CEILING_MS);
    expect(nextConversationPollDelayMs(CONVERSATION_POLL_CEILING_MS, "pending")).toBe(CONVERSATION_POLL_FAST_MS);
    expect(nextConversationPollDelayMs(1_000, "failed")).toBe(1_800);
  });

  it("slows while hidden, never overlaps two reads, and stops when disposed", async () => {
    vi.useFakeTimers();
    try {
      let hidden = false;
      let inFlight = 0;
      let overlaps = 0;
      const delays: number[] = [];
      let resolveRun: null | (() => void) = null;
      const poller = createBackoffPoller<ReturnType<typeof setTimeout>>({
        active: () => true,
        hidden: () => hidden,
        run: async () => {
          inFlight += 1;
          if (inFlight > 1) overlaps += 1;
          await new Promise<void>((resolve) => { resolveRun = resolve as () => void; });
          inFlight -= 1;
          return "idle" as const;
        },
        schedule: (callback, delayMs) => {
          delays.push(delayMs);
          return setTimeout(callback, delayMs);
        },
        cancel: (timer) => clearTimeout(timer)
      });

      poller.sync();
      expect(inFlight).toBe(1);
      poller.sync();
      expect(overlaps).toBe(0);
      (resolveRun as null | (() => void))?.();
      await Promise.resolve();
      await Promise.resolve();
      expect(delays.at(-1)).toBe(1_600);

      hidden = true;
      await vi.advanceTimersByTimeAsync(1_700);
      expect(delays.at(-1)).toBe(CONVERSATION_POLL_HIDDEN_MS);

      poller.dispose();
      const scheduled = delays.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(delays.length).toBe(scheduled);
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts one undismissed question to the person and remembers the dismissals", () => {
    const turns = parseConversationTurns([
      wireTurn({ turnId: "turn.1", ask: wireAsk({ askId: "ask.1" }) }),
      wireTurn({ turnId: "turn.2", createdAt: 1_790_000_000_001, ask: wireAsk({ askId: "ask.2" }) })
    ]);
    expect(promptableConversationTurn(turns, [])?.ask?.askId).toBe("ask.2");
    expect(promptableConversationTurn(turns, ["ask.2"])).toBeNull();

    const dismissed = Array.from({ length: 25 }, (_, index) => `ask.${index}`)
      .reduce((current, askId) => withDismissedAsk(current, askId), [] as string[]);
    expect(dismissed).toHaveLength(20);
    expect(withDismissedAsk(["ask.a", "ask.b"], "ask.a")).toEqual(["ask.b", "ask.a"]);
  });

  it("reads open conversations out of a list payload, newest first", () => {
    const conversation = (conversationId: string, status: string, updatedAt: number) => ({
      conversationId, projectId: "project.one", subject: { kind: "project", id: "project.one" }, status, createdAt: 0, updatedAt
    });
    const open = openConversationsFromPayload({
      conversations: [conversation("c.1", "open", 1), conversation("c.2", "resolved", 9), conversation("c.3", "open", 5), { junk: true }]
    });
    expect(open.map((entry) => entry.conversationId)).toEqual(["c.3", "c.1"]);
    expect(openConversationsFromPayload(undefined)).toEqual([]);
  });
});

describe("conversation answers", () => {
  const ask = (overrides: Record<string, unknown>) => parseConversationTurn(wireTurn({ ask: wireAsk(overrides) }))!.ask!;

  it("grants exactly the classes the ask listed, in Core's words, and re-authorizes it", () => {
    const presentation = conversationAskPresentation(ask({}));
    expect(presentation.consequencePhrases).toEqual([
      "send or publish something that others will receive or see",
      "create something new that stays"
    ]);
    const grant = presentation.actions.find((action) => action.actionId === "grant")!;
    expect(grant.answer).toEqual({ askId: "ask.1", kind: "grant", consequences: ["send_or_publish", "create_new"] });
    expect(conversationAnswerNeedsReauthorization(grant)).toBe(true);

    const deny = presentation.actions.find((action) => action.actionId === "deny")!;
    expect(deny.answer).toEqual({ askId: "ask.1", kind: "deny" });
    expect(conversationAnswerNeedsReauthorization(deny)).toBe(false);
  });

  it("offers one action per option, and re-authorizes only the destructive ones", () => {
    const presentation = conversationAskPresentation(ask({
      kind: "choice",
      missing: [],
      control: null,
      options: [
        { optionId: "opt.keep", label: "Keep the draft" },
        { optionId: "opt.delete", label: "Delete it", destructive: true }
      ]
    }));
    expect(presentation.actions.map((action) => action.answer)).toEqual([
      { askId: "ask.1", kind: "choice", optionId: "opt.keep" },
      { askId: "ask.1", kind: "choice", optionId: "opt.delete" }
    ]);
    expect(presentation.actions.map(conversationAnswerNeedsReauthorization)).toEqual([false, true]);
  });

  it("takes words for an open ask and fixed answers for a confirm", () => {
    expect(conversationAskPresentation(ask({ kind: "open", missing: [], control: null })).takesText).toBe(true);
    const confirm = conversationAskPresentation(ask({ kind: "confirm", missing: ["delete"], control: null }));
    expect(confirm.takesText).toBe(false);
    expect(confirm.actions.map((action) => action.actionId)).toEqual(["deny", "confirm"]);
    expect(confirm.actions[1]?.destructive).toBe(true);
  });
});
