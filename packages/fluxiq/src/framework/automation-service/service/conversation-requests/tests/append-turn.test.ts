// A turn's humanness: a whole number from 0 to 100 reaches the command's
// context, anything else is refused before the turn is written, and a turn
// without it carries nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";

const started = vi.hoisted(() => ({ contexts: [] as unknown[] }));

vi.mock("../../../../../runtime/conversations/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../runtime/conversations/index.ts")>()),
  automationStudioConversationCommandVocabulary: () => [],
  automationStudioConversationKnownTask: () => null,
  automationStudioConversationCommandPort: () => ({ call: async () => ({ ok: true }) }),
  startAutomationStudioConversationCommand: async ({ context }: { context: unknown }) => {
    started.contexts.push(context);
    return null;
  }
}));

import { appendConversationTurnForRequest } from "../append-turn.ts";

type Dependencies = Parameters<typeof appendConversationTurnForRequest>[0];
type Request = Parameters<typeof appendConversationTurnForRequest>[1];
type Payload = Parameters<typeof appendConversationTurnForRequest>[3];

const caller = { userId: "user", sessionId: "session", paired: false, keyLocked: false, keyNeedsUnlock: false, keyLockReason: undefined };

function harness() {
  const written: unknown[] = [];
  const dependencies = {
    registry: {},
    service: {
      assertProjectDomainAccess: async () => undefined,
      listProjects: async () => ({ projects: [] }),
      conversations: {
        callerFor: () => caller,
        noteKeySetupStepTold: () => undefined,
        appendTurn: async (turn: unknown) => {
          written.push(turn);
          return { turnId: "t" };
        },
        respondToPersonTurn: async () => ({ turn: { turnId: "t" }, response: null, problem: null })
      }
    }
  };
  const request = { scope: { domainId: null }, actor: { userId: "user", sessionId: "session" } };
  const append = (payload: Record<string, unknown>) => appendConversationTurnForRequest(dependencies as unknown as Dependencies, request as unknown as Request, "project", { conversationId: "c", text: "hi", capabilities: [], ...payload } as Payload);
  return { append, written };
}

describe("a chat turn's humanness", () => {
  beforeEach(() => { started.contexts.length = 0; });

  it.each([0, 1, 50, 100])("passes %s into the command's context", async (humanness) => {
    await harness().append({ humanness });
    expect(started.contexts[0]).toMatchObject({ humanness });
  });

  it.each([101, -1, 1.5, "x", null, Number.NaN])("refuses %s and writes nothing", async (humanness) => {
    const h = harness();
    await expect(h.append({ humanness })).rejects.toThrow(/humanness/);
    expect(h.written).toEqual([]);
    expect(started.contexts).toEqual([]);
  });

  it("leaves the context without the field when the turn has none", async () => {
    await harness().append({});
    expect(started.contexts).toHaveLength(1);
    expect(started.contexts[0]).not.toHaveProperty("humanness");
    expect(Object.keys(started.contexts[0] as object)).not.toContain("humanness");
  });
});
