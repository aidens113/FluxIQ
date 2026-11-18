import { modelAccessFromCore, type CoreModelAccess, type ModelAccessState, type ModelKeysPort } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { sharedPanelChanges, type PanelChangesPort } from "../../panel-changes";
import { readCoreModelAccess } from "../access";
import { keyFailure } from "./key-failure";

/** The panel's model-keys port: the card's port, plus a way for other parts of a page to hear that a key changed. */
export type PanelModelKeysPort = ModelKeysPort & {
  /** Hears the key's pushed state (`model-access` on the page's change stream): `null` means "changed, read again". Returns a stop function. */
  subscribe(listener: (state: ModelAccessState | null) => void): () => void;
  /** Calls `listener` after every save, replace or remove through this port, and after `notify`. Returns a stop function. */
  onChange(listener: () => void): () => void;
  /** Tells listeners the keys may have changed (a chat that failed, a key changed elsewhere on the page). */
  notify(): void;
};

// The card names a provider by a lower-case id; the engine's own key list says it as a name.
const PROVIDER_NAMES: Readonly<Record<string, string>> = { anthropic: "Anthropic", deepseek: "DeepSeek" };
const COULD_NOT_READ = "Couldn't check your AI key just now.";

/**
 * The key card's port over the Secret Keys program. The state is the `modelAccess` of its snapshot (Core's own
 * reading, mapped by `modelAccessFromCore`); the key's pushed `model-access` event (the page's change stream) tells `subscribe` and `onChange` listeners to read again. A key is saved, replaced
 * and removed in ONE call each, with no password or PIN (Core's secret-keys answers a signed-in person; the
 * key-backend task removes the old password requirement there): no press grant is minted first and no error text
 * is matched. A create or rotate answer that carries the checked `modelAccess` is shown as it is, without a
 * second read.
 */
export function createPanelModelKeysPort(secretKeys: ProgramCommandTransport, changes: () => PanelChangesPort = sharedPanelChanges): PanelModelKeysPort {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  // Hears the page's one change stream for the key's state. The first `opened` is the stream opening (the card reads at
  // mount anyway); a later one means changes may have been missed, which reads like a change.
  const hear = (call: () => void): (() => void) => {
    let first = true;
    return changes().subscribe({
      modelAccess: call,
      opened: () => {
        if (first) first = false;
        else call();
      }
    });
  };
  const password = (value: string | undefined) => (value ? { authorizationPassword: value } : {});
  // The checked state a write answered with, shown by the next read instead of asking again.
  let answered: CoreModelAccess | null = null;
  const keep = (payload: { modelAccess?: unknown } | undefined) => { answered = readCoreModelAccess(payload?.modelAccess); };
  return {
    requiresPassword: false,
    canWrite: true,
    onChange(listener) {
      listeners.add(listener);
      const stop = hear(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    subscribe: (listener) => hear(() => listener(null)),
    notify,
    async readState() {
      if (answered) {
        const access = answered;
        answered = null;
        return { ok: true, state: modelAccessFromCore(access), ...(access.key?.id ? { keyId: access.key.id } : {}) };
      }
      const response = await secretKeys.get<{ modelAccess?: unknown }>("snapshot");
      if (!response.ok || !response.payload) return { ok: false, message: COULD_NOT_READ };
      const access = readCoreModelAccess(response.payload.modelAccess);
      return { ok: true, state: modelAccessFromCore(access), ...(access?.key?.id ? { keyId: access.key.id } : {}) };
    },
    async save(request) {
      const response = await secretKeys.post<{ id?: unknown; modelAccess?: unknown }>("create-key", {
        name: request.name?.trim() || "AI key",
        value: request.value,
        kind: "llm",
        provider: PROVIDER_NAMES[request.provider] ?? request.provider,
        scope: "global",
        scopeRef: "",
        description: "",
        metadata: {},
        enabled: true,
        ...password(request.password)
      });
      if (!response.ok) return { ok: false, message: keyFailure(response) };
      keep(response.payload);
      notify();
      const id = response.payload?.id;
      return { ok: true, ...(typeof id === "string" && id ? { keyId: id } : {}) };
    },
    async replace(keyId, value, accountPassword) {
      const response = await secretKeys.post<{ modelAccess?: unknown }>("rotate-key", { id: keyId, value, ...password(accountPassword) });
      if (!response.ok) return { ok: false, message: keyFailure(response) };
      keep(response.payload);
      notify();
      return { ok: true };
    },
    async remove(keyId, accountPassword) {
      const response = await secretKeys.post("delete-key", { id: keyId, ...password(accountPassword) });
      if (!response.ok) return { ok: false, message: keyFailure(response) };
      notify();
      return { ok: true };
    }
  };
}
