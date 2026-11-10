// The assistant's model from the key Settings chose: a plain reason when there
// is none or it cannot be used, and otherwise that provider's chat adapter with
// that key, released per call. Dummy key values only; no network.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioSessionKeyPorts } from "../../../../llm/index.ts";
import { panelAssistantKeyModelSource } from "../key-model-source.ts";

const CALLER = { userId: "user.ada", sessionId: "session.ada" };

function ports(): AutomationStudioSessionKeyPorts {
  return {
    snapshot: async () => ({ keys: [{ id: "key.chosen", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, createdBy: "user.ada" }, { id: "key.other", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 2, createdBy: "user.ada" }] }),
    createSessionRevealAuthorization: async ({ id }) => ({ authorizationId: `auth.${id}`, keyId: id, keyUpdatedAtMs: 1 }),
    revealKeyWithAuthorization: async ({ id }) => ({ value: `dummy-value-of-${id}` }),
    revokeRevealAuthorization: () => undefined
  };
}

describe("panelAssistantKeyModelSource", () => {
  it("answers Secret Keys' reason when there is no key", async () => {
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => ({ ok: false, reason: "Add a model key in Settings to use the assistant." }), keyPorts: ports() });
    expect(await source(CALLER)).toEqual({ ok: false, reason: "Add a model key in Settings to use the assistant." });
  });

  it("refuses in plain words a provider or model the assistant cannot call", async () => {
    expect(await panelAssistantKeyModelSource({ resolveAssistant: async () => ({ ok: true, keyId: "k", keyName: "Work key", provider: "elsewhere" }), keyPorts: ports() })(CALLER))
      .toEqual({ ok: false, reason: "The assistant cannot use “Work key” yet: FluxIQ's assistant works with Anthropic and DeepSeek keys. Choose another key in Settings." });
    expect(await panelAssistantKeyModelSource({ resolveAssistant: async () => ({ ok: true, keyId: "k", keyName: "Work key", provider: "anthropic", model: "no-such-model" }), keyPorts: ports() })(CALLER))
      .toEqual({ ok: false, reason: "The model chosen for “Work key” is not one FluxIQ can use. Pick another in Settings." });
  });

  it("calls the chosen key's provider with that key, released for the call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => ({ ok: true, keyId: "key.chosen", keyName: "Work key", provider: "Anthropic" }), keyPorts: ports(), fetchImpl });
    const choice = await source(CALLER);
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    expect(choice.model.name).toMatch(/^anthropic:/u);
    await expect(choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: new AbortController().signal, caller: CALLER })).rejects.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetchImpl.mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer dummy-value-of-key.chosen");
  });
});
