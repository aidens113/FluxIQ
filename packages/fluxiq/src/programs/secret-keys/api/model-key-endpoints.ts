import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiResponse } from "../../_shared/api.ts";
import { endpointResource } from "../../_shared/iam/index.ts";
import type { SecretKeysService } from "../runtime/service.ts";
import type { SecretKeySummary } from "../types.ts";
import { callerModelAccess, type SecretKeyModelAccessOf, type SecretKeySessionOf } from "./caller-model-access.ts";
import { SECRET_KEYS_ENDPOINTS, type SaveModelKeyProvider } from "./contracts.ts";
import { checkSavedModelKey, type SecretKeySavedKeyCheck } from "./saved-key-check.ts";

/** What the three model-key writes need from the host besides the service. */
export type ModelKeyWritePorts = {
  modelAccessOf?: SecretKeyModelAccessOf | undefined;
  keySessionOf?: SecretKeySessionOf | undefined;
  checkSavedKey?: SecretKeySavedKeyCheck | undefined;
};

const PROVIDERS: Readonly<Record<SaveModelKeyProvider, { stored: string; defaultName: string }>> = {
  anthropic: { stored: "Anthropic", defaultName: "Anthropic key" },
  deepseek: { stored: "DeepSeek", defaultName: "DeepSeek key" }
};
const MAX_NAME_LENGTH = 200;

const NO_ACCESS_READING = "This server cannot tell which model key your chats use, so nothing was changed.";
const REFUSALS = {
  replace: { none: "Your chats use no model key yet, so there is none to replace. Save a key first.", lent: "The key your chats use belongs to someone else, so only they can replace it. Save your own key instead." },
  remove: { none: "Your chats use no model key, so there is none to remove.", lent: "The key your chats use belongs to someone else, so only they can remove it." }
} as const;

type Refusal = { ok: false; error: string };

/**
 * `save-model-key`, `replace-model-key` and `remove-model-key`: the key a
 * person's chats use, saved, replaced or removed from the panel or a paired
 * client with nothing but IAM (`secrets.manage`, Write, on the workspace). No
 * password, PIN or authenticator code is asked for. Each answers the caller's
 * model access read after the change; never the value.
 */
export function registerModelKeyWriteEndpoints(registry: GlobalProgramApiRegistry, service: SecretKeysService, ports: ModelKeyWritePorts): void {
  const access = (actor: ProgramApiActor, answer: boolean) => {
    if (!ports.modelAccessOf) throw new Error(NO_ACCESS_READING);
    return callerModelAccess({ service, modelAccessOf: ports.modelAccessOf, keySessionOf: ports.keySessionOf, actor, answer });
  };
  const answered = async (actor: ProgramApiActor): Promise<ProgramApiResponse> => ({ ok: true, payload: { modelAccess: await access(actor, true) } });
  /** The caller's in-use key when it is their own, or the plain reason it cannot be changed. */
  const ownInUseKey = async (actor: ProgramApiActor, act: keyof typeof REFUSALS): Promise<SecretKeySummary | Refusal> => {
    const id = (await access(actor, false)).key?.id;
    const key = id ? await service.getKeySummary(id) : null;
    if (!key) return { ok: false, error: REFUSALS[act].none };
    return key.createdBy === actor.userId ? key : { ok: false, error: REFUSALS[act].lent };
  };
  const common = {
    programId: "secret-keys",
    permission: "secrets.manage",
    // Decided by IAM alone: the program adds no credential step, and the registry adds none for this classification.
    classification: "program-gated",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    // Activity says the key was saved, replaced or removed only when it was: the outcome is audited after the handler.
    auditOutcome: true
  } as const;

  registry.register({
    ...common,
    endpoint: SECRET_KEYS_ENDPOINTS.saveModelKey,
    action: "secrets:SaveModelKey",
    assistant: { hidden: "Takes a key's value, which is never given to the assistant." },
    handler: async (request) => {
      const input = readSaveModelKey(request.payload);
      if (!input.ok) return input;
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Sign in to FluxIQ to save a key." };
      if (!ports.modelAccessOf) return { ok: false, error: NO_ACCESS_READING };
      return refusedPlainly(async () => {
        const provider = PROVIDERS[input.provider];
        // One change notice, given once the free check is recorded: no client reads the new key as ready before the check says.
        await service.holdingModelKeysNotice(async () => {
          const key = await service.createKey({ name: input.name ?? provider.defaultName, value: input.value, kind: "llm", provider: provider.stored, createdBy: actor.userId });
          // The caller's chats use the key they just saved: chosen as the assistant's key unless it already is the one they use.
          if ((await access(actor, false)).key?.id !== key.id) await service.modelKeys.setAssistant({ keyId: key.id, chosenBy: actor.userId });
          await checkSavedModelKey(ports.checkSavedKey, key, input.value);
        });
        return answered(actor);
      });
    }
  });
  registry.register({
    ...common,
    endpoint: SECRET_KEYS_ENDPOINTS.replaceModelKey,
    action: "secrets:ReplaceModelKey",
    assistant: { hidden: "Takes a new key value, which is never given to the assistant." },
    handler: async (request) => {
      const value = readValue(request.payload);
      if (typeof value !== "string") return value;
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Sign in to FluxIQ to replace a key." };
      return refusedPlainly(async () => {
        const key = await ownInUseKey(actor, "replace");
        if ("ok" in key) return key;
        await service.holdingModelKeysNotice(async () => {
          const replaced = await service.rotateKey({ id: key.id, value, actorUserId: actor.userId });
          await checkSavedModelKey(ports.checkSavedKey, replaced, value);
        });
        return answered(actor);
      });
    }
  });
  registry.register({
    ...common,
    endpoint: SECRET_KEYS_ENDPOINTS.removeModelKey,
    action: "secrets:RemoveModelKey",
    assistant: { hidden: "A person removes their own model key themselves; the assistant never does it for them." },
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Sign in to FluxIQ to remove a key." };
      return refusedPlainly(async () => {
        const key = await ownInUseKey(actor, "remove");
        if ("ok" in key) return key;
        await service.deleteKey(key.id);
        return answered(actor);
      });
    }
  });
}

function readSaveModelKey(payload: unknown): { ok: true; provider: SaveModelKeyProvider; value: string; name?: string } | Refusal {
  const record = recordOf(payload);
  const provider = record.provider;
  if (provider !== "anthropic" && provider !== "deepseek") return { ok: false, error: 'provider must be "anthropic" or "deepseek"' };
  const value = readValue(payload);
  if (typeof value !== "string") return value;
  if (record.name !== undefined && typeof record.name !== "string") return { ok: false, error: "name must be text" };
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "That key name is too long." };
  return { ok: true, provider, value, ...(name ? { name } : {}) };
}

function readValue(payload: unknown): string | Refusal {
  const value = recordOf(payload).value;
  return typeof value === "string" && value.trim() ? value : { ok: false, error: "value is required" };
}

function recordOf(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

/** A refusal the service words for a person becomes the reply's error. No message here is built from a value. */
async function refusedPlainly(run: () => Promise<ProgramApiResponse>): Promise<ProgramApiResponse> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
