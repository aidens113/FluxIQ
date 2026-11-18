import { describe, expect, it } from "vitest";
import type { CoreTurn } from "../../conversation/index.ts";
import { firstPersonMessage } from "../first-person-message.ts";

const turn = (author: string, text: string, extra: Partial<CoreTurn> = {}): CoreTurn => ({ turnId: `${author}-${text}`, author, text, ask: null, ...extra });

describe("firstPersonMessage", () => {
  it("is the person's first sent message, after any automation turn before it", () => {
    expect(firstPersonMessage({ turns: [turn("automation", "Hi"), turn("person", "Find cheap towels"), turn("person", "Thanks")] })).toBe("Find cheap towels");
  });
  it("skips a message that did not send", () => {
    expect(firstPersonMessage({ turns: [turn("person", "lost", { sendError: "offline" }), turn("person", "Sent")] })).toBe("Sent");
  });
  it("is unknown while earlier turns are unread, or when there is no person turn", () => {
    expect(firstPersonMessage({ turns: [turn("person", "Later")], earlierTurns: true })).toBeUndefined();
    expect(firstPersonMessage({ turns: [turn("automation", "Hello")] })).toBeUndefined();
    expect(firstPersonMessage({ turns: [turn("person", "   ")] })).toBeUndefined();
  });
});
