// The lookup a chat turn takes to start a known task with no model call (task speed S6): it asks the
// read route "automate this" asks, with the page on screen, and knows a task only in answer-first mode.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioConversationCommandContext } from "../command.ts";
import { automationStudioConversationKnownTask } from "../answer-first/index.ts";

function context(answer: (payload: Record<string, unknown>) => { ok: true; payload?: unknown } | { ok: false; error: string }) {
  const asked: Array<Record<string, unknown>> = [];
  const port: AutomationStudioConversationCommandContext["port"] = {
    async call(endpoint, payload) {
      asked.push({ endpoint, ...payload });
      return answer(payload);
    }
  };
  return { asked, context: { port, projectId: "project.1", startLocation: "http://127.0.0.1:4100/classifieds" } };
}

describe("whether a chat message is a known task", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is known when Core answers the Flow the task lives under, asked with the words and the page", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first");
    const { asked, context: given } = context((payload) => ({ ok: true, payload: payload.instructionText === "Save the tables" ? { flowId: "flow.1" } : {} }));
    const known = automationStudioConversationKnownTask(given);
    expect(await known("Save the tables")).toBe(true);
    expect(await known("Save the chairs")).toBe(false);
    expect(asked[0]).toEqual({ endpoint: "get-task-known-flow", projectId: "project.1", instructionText: "Save the tables", startLocation: "http://127.0.0.1:4100/classifieds" });
  });

  it("is not known when the lookup fails or throws", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first");
    expect(await automationStudioConversationKnownTask(context(() => ({ ok: false, error: "unreadable" })).context)("Save the tables")).toBe(false);
    const throwing = { port: { call: async () => { throw new Error("gone"); } }, projectId: "project.1", startLocation: null };
    expect(await automationStudioConversationKnownTask(throwing)("Save the tables")).toBe(false);
  });

  it("asks nothing outside answer-first mode", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate");
    const { asked, context: given } = context(() => ({ ok: true, payload: { flowId: "flow.1" } }));
    expect(await automationStudioConversationKnownTask(given)("Save the tables")).toBe(false);
    expect(asked).toEqual([]);
  });
});
