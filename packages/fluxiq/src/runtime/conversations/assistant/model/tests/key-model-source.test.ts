// The assistant's model from the key Settings chose: a plain reason when there
// is none or it cannot be used, and otherwise that provider's chat adapter with
// that key, released per call. Dummy key values only; no network.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioSessionKeyPorts } from "../../../../llm/index.ts";
import { secretsLockedMessage, workspaceKeyLockedMessage, isSecretsLockedError } from "@fluxiq/contracts/platform";
import { panelAssistantKeyModelSource, type PanelAssistantKeyChoice } from "../key-model-source.ts";

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

describe("panelAssistantKeyModelSource on another person's key", () => {
  const HOST = "app.example.test";
  const GRACE = "user.grace";
  /** Grace holds the workspace's key; `unlocked` says whether her live unlock holds it. Ada (CALLER) sends. */
  function lentPorts(unlocked: boolean) {
    const revealed: string[] = [];
    const keyPorts: AutomationStudioSessionKeyPorts = {
      snapshot: async () => ({ keys: [{ id: "key.team", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, createdBy: GRACE }] }),
      createSessionRevealAuthorization: async ({ id, sessionId, userId }) => {
        if (!unlocked || sessionId !== "session.grace" || userId !== GRACE) throw new Error("This unlock does not hold that key.");
        return { authorizationId: `auth.${id}`, keyId: id, keyUpdatedAtMs: 1 };
      },
      revealKeyWithAuthorization: async ({ id }) => {
        revealed.push(id);
        return { value: `dummy-value-of-${id}` };
      },
      revokeRevealAuthorization: () => undefined,
      fallbackUnlockFor: (userId) => (userId === GRACE ? "session.grace" : null)
    };
    return { keyPorts, revealed };
  }
  const team = (share: { chosenForWorkspace?: boolean; offeredByHolder?: boolean }): PanelAssistantKeyChoice => ({ ok: true, keyId: "key.team", keyName: "Team key", provider: "Anthropic", ownerId: GRACE, ...share });
  const NOT_CHOSEN = "No model key has been chosen for this workspace's messages yet. An owner or administrator of this workspace chooses one in Settings, from a key its holder has offered to the workspace.";
  const NOT_OFFERED = "The key chosen for this workspace's messages has not been offered to the workspace by the person who added it, so it pays only for their own messages. They can offer it in Settings, or an owner or administrator of this workspace can choose another.";
  const decide = async (source: ReturnType<typeof panelAssistantKeyModelSource>, caller: { userId: string; sessionId: string }) => {
    const choice = await source(caller);
    if (!choice.ok) throw new Error(choice.reason);
    return choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: new AbortController().signal, caller }).catch((error: unknown) => error);
  };

  it("refuses in plain words, naming who chooses, unless the key is both chosen and offered, and releases nothing", async () => {
    const { keyPorts, revealed } = lentPorts(true);
    for (const [share, reason] of [
      [{}, NOT_CHOSEN],
      [{ offeredByHolder: true }, NOT_CHOSEN],
      [{ chosenForWorkspace: true }, NOT_OFFERED],
      [{ chosenForWorkspace: true, offeredByHolder: false }, NOT_OFFERED]
    ] as const) {
      expect(await panelAssistantKeyModelSource({ resolveAssistant: async () => team(share), keyPorts })(CALLER), JSON.stringify(share)).toEqual({ ok: false, reason });
    }
    expect(revealed).toEqual([]);
  });

  it("releases a chosen and offered key to its holder's unlock for the sender's call", async () => {
    const { keyPorts, revealed } = lentPorts(true);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => team({ chosenForWorkspace: true, offeredByHolder: true }), keyPorts, fetchImpl });
    await decide(source, CALLER);
    expect(revealed).toEqual(["key.team"]);
    expect(new Headers(fetchImpl.mock.calls[0]![1]!.headers).get("authorization")).toBe("Bearer dummy-value-of-key.team");
  });

  it("tells the sender the workspace's key is locked and its owner must unlock it; its holder keeps their own words", async () => {
    const { keyPorts } = lentPorts(false);
    const fetchImpl = vi.fn<typeof fetch>();
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => team({ chosenForWorkspace: true, offeredByHolder: true }), keyPorts, instanceHost: HOST, fetchImpl });
    const bySender = await decide(source, CALLER);
    expect(isSecretsLockedError(bySender)).toBe(true);
    expect((bySender as Error).message).toBe(workspaceKeyLockedMessage(HOST));
    expect((bySender as { signInUrl?: string }).signInUrl).toBeUndefined();
    const byHolder = await decide(source, { userId: GRACE, sessionId: "session.grace" });
    expect(isSecretsLockedError(byHolder)).toBe(true);
    expect((byHolder as Error).message).toBe(secretsLockedMessage(HOST));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["the holder withdraws the offer", { chosenForWorkspace: true, offeredByHolder: false }],
    ["the workspace choice is cleared", { chosenForWorkspace: false, offeredByHolder: true }],
    ["another key is chosen", { keyId: "key.other", chosenForWorkspace: true, offeredByHolder: true }],
    ["another provider is chosen", { provider: "DeepSeek", chosenForWorkspace: true, offeredByHolder: true }],
    ["another model is chosen", { model: "claude-haiku-5-5", chosenForWorkspace: true, offeredByHolder: true }]
  ] as const)("does not spend a captured choice again after %s", async (_label, changed) => {
    const { keyPorts, revealed } = lentPorts(true);
    let current: PanelAssistantKeyChoice = team({ chosenForWorkspace: true, offeredByHolder: true });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => current, keyPorts, fetchImpl });
    const resolved = await source(CALLER);
    if (!resolved.ok) throw new Error(resolved.reason);
    const call = () => resolved.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: new AbortController().signal, caller: CALLER });
    await expect(call()).rejects.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    current = { ...team({ chosenForWorkspace: true, offeredByHolder: true }), ...changed };
    const refusal = await call().catch((error: unknown) => error);

    expect(refusal).toMatchObject({ message: changed.offeredByHolder === false ? NOT_OFFERED : changed.chosenForWorkspace === false ? NOT_CHOSEN : "The model key or model chosen for this workspace's messages has changed. Send the message again to use the current choice in Settings." });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(revealed).toEqual(["key.team"]);
  });

  it("does not reach the provider when the offer is withdrawn while the key is being released", async () => {
    const { keyPorts } = lentPorts(true);
    let current = team({ chosenForWorkspace: true, offeredByHolder: true });
    const reveal = keyPorts.revealKeyWithAuthorization;
    keyPorts.revealKeyWithAuthorization = async (request) => {
      const answer = await reveal(request);
      // A separate holder operation completes before release returns.
      current = team({ chosenForWorkspace: true, offeredByHolder: false });
      return answer;
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    const source = panelAssistantKeyModelSource({ resolveAssistant: async () => current, keyPorts, fetchImpl });

    const refusal = await decide(source, CALLER);

    expect(refusal).toMatchObject({ message: NOT_OFFERED });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
