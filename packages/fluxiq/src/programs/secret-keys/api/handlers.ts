import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../_shared/api.ts";
import { endpointResource } from "../../_shared/iam/index.ts";
import { getAssistantModelInput, secretKeysSnapshotInput, setAssistantModelInput, setDefaultKeyInput } from "@fluxiq/contracts/program-api-inputs";
import { isJsonObject } from "../../../framework/persistence/program-state/storage.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import {
  SECRET_KEYS_ENDPOINTS,
  type CreateSecretKeyRequest,
  type DeleteSecretKeyRequest,
  type OfferSecretKeyRequest,
  type RevealSecretKeyRequest,
  type RotateSecretKeyRequest,
  type SecretKeyAuthorizationPayload,
  type UpdateSecretKeyRequest
} from "./contracts.ts";
import type { SecretKeyActorSession, SecretKeysService } from "../runtime/service.ts";
import type { SecretKeysSnapshot } from "../types.ts";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import { unofferedKeyRefusal } from "./unoffered-key-refusal.ts";
import { createSecretKeyManagementProof, type SecretKeyManagementProof } from "../runtime/access/index.ts";

/** Trusted host identity authority; tenant storage never becomes the account authority. */
export type SecretKeyIdentityAuthority = Pick<IdentityAccessService, "validateSession" | "authorizeSessionCredentials" | "authorizeSessionPasswordPin">;
type IdentityAuthoritySource = SecretKeyIdentityAuthority | (() => Promise<SecretKeyIdentityAuthority>);

// The acting user's id, never the payload, names whose password seals a value:
// it becomes the seal's `sealedByUserId` on create, rotate, and an upgrading reveal.
// `keySessionOf` names the session a caller acts under (a paired client's is its own) and the holder asking, for the readiness a snapshot carries.
// `modelAccessOf` is the host's reading of the caller's model access, from the snapshot read for them; it rides on that snapshot as `modelAccess`.
export function registerSecretKeysApi(registry: GlobalProgramApiRegistry, service: SecretKeysService, identityAccess?: IdentityAuthoritySource, keySessionOf?: (actor: ProgramApiActor) => { sessionId: string | null; holderId?: string | undefined }, modelAccessOf?: (actor: ProgramApiActor, snapshot: SecretKeysSnapshot) => Promise<ModelAccessState>): void {
  // A key's owner is the user that created it (`createdBy`, stamped from the
  // acting user on create), so the service already records it and no separate
  // `recordOwner` is needed. An unknown key, or one with no creator, has no owner.
  registry.registerResourceOwners("key", {
    ownerOf: async (id) => (await service.getKeySummary(id))?.createdBy ?? null
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    action: "secrets:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    assistant: { input: secretKeysSnapshotInput, summary: "Lists the person's model keys by name and provider, and says which is the default and whether saved keys are available. A key's value is never shown.", phrases: ["list my keys", "which model keys do I have"] },
    list: {
      items: (payload) => (payload as { keys?: readonly unknown[] } | undefined)?.keys ?? [],
      ref: (item) => ({ kind: "key", keyId: (item as { id?: unknown }).id }),
      replace: (payload, kept) => ({ ...(payload as object), keys: kept })
    },
    handler: async (request) => {
      if (!request.actor || !keySessionOf) return { ok: true, payload: await service.snapshot() };
      const snapshot = await service.snapshotFor({ userId: request.actor.userId, ...keySessionOf(request.actor) });
      return { ok: true, payload: modelAccessOf ? { ...snapshot, modelAccess: await modelAccessOf(request.actor, snapshot) } : snapshot };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.createKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:CreateKey",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    assistant: { hidden: "Takes a key's value and the person's password, which are never given to the assistant." },
    creates: (payload) => {
      const id = payload !== null && typeof payload === "object" ? (payload as { id?: unknown }).id : undefined;
      return typeof id === "string" && id ? { kind: "key", keyId: id } : null;
    },
    handler: async (request) => {
      const payload = request.payload as CreateSecretKeyRequest | undefined;
      if (!payload?.name || !payload.value) return { ok: false, error: "name and value are required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, request.actor, { requireTotp: false });
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.createKey({ ...payload, createdBy: request.actor?.userId, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.updateKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:UpdateKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    assistant: { hidden: "Needs the person's password to rename or change a key, which is never given to the assistant." },
    handler: async (request) => {
      const payload = request.payload as UpdateSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      if (payload.metadata !== undefined && !isJsonObject(payload.metadata)) return { ok: false, error: "metadata must be a JSON object" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, request.actor);
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.updateKey({ ...payload, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.rotateKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:RotateKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    assistant: { hidden: "Takes a new key value and the person's password, which are never given to the assistant." },
    handler: async (request) => {
      const payload = request.payload as RotateSecretKeyRequest | undefined;
      if (!payload?.id || !payload.value) return { ok: false, error: "id and value are required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, request.actor);
      if (!authorization.ok) return authorization;
      const actorSession = await verifiedActorSession(identityAccess, payload, request.actor);
      return { ok: true, payload: await service.rotateKey({ ...payload, actorUserId: request.actor?.userId, actorSession }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.revealKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:RevealKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    assistant: { hidden: "Shows a key's value, which is never given to the assistant." },
    handler: async (request) => {
      const payload = request.payload as RevealSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, request.actor);
      if (!authorization.ok) return authorization;
      const managementProof = await revealManagementProof(identityAccess, registry, request.actor, payload.id);
      return { ok: true, payload: await service.revealKey({ ...payload, actorUserId: request.actor?.userId, managementProof }) };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.deleteKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:DeleteKey",
    accessLevel: "Write",
    resource: endpointResource.key("id"),
    assistant: { hidden: "Needs the person's password to delete a key, which is never given to the assistant." },
    handler: async (request) => {
      const payload = request.payload as DeleteSecretKeyRequest | undefined;
      if (!payload?.id) return { ok: false, error: "id is required" };
      const authorization = await authorizeSecretMutation(identityAccess, payload, request.actor);
      if (!authorization.ok) return authorization;
      return { ok: true, payload: { deleted: await service.deleteKey(payload.id) } };
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.setDefaultKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:SetDefaultKey",
    accessLevel: "Write",
    // The default is one choice for the whole workspace (every person's
    // assistant and new Flows use it), so it is decided on the workspace, as
    // `set-assistant-model` is, never on the key: owning a key must not let a
    // person make it everyone's default.
    resource: endpointResource.workspace(),
    assistant: { input: setDefaultKeyInput, summary: "Makes one of the person's model keys the default key.", phrases: ["use this key by default", "make this the default key"], contextArgs: { id: "keyId" }, target: { id: "key" } },
    handler: async (request) => {
      const input = setDefaultKeyInput.read(request.payload);
      if (!input.ok) return { ok: false, error: "id is required" };
      const unoffered = await unofferedKeyRefusal(service, input.value.id, request.actor?.userId);
      if (unoffered) return { ok: false, error: unoffered };
      return plainRefusal(async () => ({ ok: true, payload: await service.modelKeys.setDefault(input.value.id, request.actor?.userId) }));
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.getAssistantModel,
    permission: "programs.read",
    classification: "read",
    action: "secrets:GetAssistantModel",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    assistant: { input: getAssistantModelInput, summary: "Says which key and model the assistant uses, and which key is the default.", phrases: ["which model are you using", "which key do you use"] },
    handler: async () => ({ ok: true, payload: await service.modelKeys.read() })
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.setAssistantModel,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:SetAssistantModel",
    accessLevel: "Write",
    // The assistant's key and model are the workspace's choice: decided on the workspace.
    resource: endpointResource.workspace(),
    assistant: { input: setAssistantModelInput, summary: "Chooses the key and model the assistant uses; with neither, it uses the default key and that provider's normal model.", phrases: ["use a different model", "change the assistant's key"], contextArgs: { keyId: "keyId" }, target: { keyId: "key" } },
    handler: async (request) => {
      const input = setAssistantModelInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      const { keyId, model } = input.value;
      if (keyId !== undefined) {
        const unoffered = await unofferedKeyRefusal(service, keyId, request.actor?.userId);
        if (unoffered) return { ok: false, error: unoffered };
      }
      return plainRefusal(async () => ({ ok: true, payload: await service.modelKeys.setAssistant({ keyId, model, chosenBy: request.actor?.userId }) }));
    }
  });
  registry.register({
    programId: "secret-keys",
    endpoint: SECRET_KEYS_ENDPOINTS.offerKey,
    permission: "secrets.manage",
    classification: "program-gated",
    action: "secrets:OfferKey",
    accessLevel: "Write",
    // The holder's own consent for their own key: decided on the key, which
    // `OwnData` reaches only for its holder, and refused by the service to
    // anyone but the person who added it, an owner or administrator included.
    resource: endpointResource.key("id"),
    assistant: { hidden: "Lets a person's own key pay for other people's messages, so the person decides it themselves in Settings; the assistant never does it for them." },
    handler: async (request) => {
      const payload = request.payload as Partial<OfferSecretKeyRequest> | undefined;
      if (typeof payload?.id !== "string" || !payload.id || typeof payload.offered !== "boolean") return { ok: false, error: "id and offered are required" };
      if (!request.actor) return { ok: false, error: "Sign in to FluxIQ to offer your key to the workspace." };
      // A paired browser's credential never makes this choice; the person makes it in the panel.
      if (request.actor.channel === "paired-client") return { ok: false, error: "Offer a key to the workspace from Settings in the FluxIQ panel." };
      const { id, offered } = payload;
      const holderId = request.actor.userId;
      return plainRefusal(async () => ({ ok: true, payload: await service.modelKeys.setOffered(id, offered, holderId) }));
    }
  });
}

/** A refusal the service words for a person (a missing, disabled or wrong kind of key) becomes the reply's error. */
async function plainRefusal(run: () => Promise<{ ok: true; payload: unknown }>): Promise<{ ok: true; payload: unknown } | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The caller's own signed-in session, after `authorizeSecretMutation` verified
 * the password against it: the session that checked the password must be the
 * caller's, still live, and the caller's user. Its expiry bounds how long the
 * key stays held. Undefined otherwise, and then no session takes the key.
 */
async function verifiedActorSession(source: IdentityAuthoritySource | undefined, payload: SecretKeyAuthorizationPayload, actor: ProgramApiActor | undefined): Promise<SecretKeyActorSession | undefined> {
  const identityAccess = typeof source === "function" ? await source() : source;
  if (!identityAccess || !actor || !payload.authSessionId || payload.authSessionId !== actor.sessionId) return undefined;
  // An unknown or expired session reads as null; a store that cannot be read throws, and the request fails with it.
  const context = await identityAccess.validateSession(payload.authSessionId);
  if (!context || context.user.id !== actor.userId) return undefined;
  return { sessionId: context.session.id, userId: context.user.id, expiresAtMs: context.session.expiresAtMs };
}

/** A one-use server capability, separate from model-use grants and never request-controlled. */
async function revealManagementProof(source: IdentityAuthoritySource | undefined, registry: GlobalProgramApiRegistry, actor: ProgramApiActor | undefined, id: string): Promise<SecretKeyManagementProof> {
  if (!actor) throw new Error("Secret key management requires authentication.");
  const { sessionId, userId } = actor;
  const validate = async () => {
    const identity = typeof source === "function" ? await source() : source;
    const current = await identity?.validateSession(sessionId);
    if (!current || current.user.id !== userId) return false;
    const decision = await registry.authorize({ actor: { sessionId, userId, roleId: current.role.id, permissions: current.role.permissions }, action: "secrets:RevealKey", permission: "secrets.manage", resources: { kind: "key", keyId: id }, programId: "secret-keys" });
    return decision.allowed;
  };
  if (!await validate()) throw new Error("Secret key management is not authorized.");
  return createSecretKeyManagementProof({ id, userId, operation: "reveal", expiresAtMs: Date.now() + 10_000, validate });
}

async function authorizeSecretMutation(source: IdentityAuthoritySource | undefined, payload: SecretKeyAuthorizationPayload, actor: ProgramApiActor | undefined, options: { requireTotp?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string; requiresRecheck: true }> {
  const identityAccess = typeof source === "function" ? await source() : source;
  if (!identityAccess) return { ok: false, requiresRecheck: true, error: "Secret key authorization is unavailable" };
  if (!actor || !payload.authSessionId || payload.authSessionId !== actor.sessionId) return { ok: false, requiresRecheck: true, error: "Secret key authorization must use the authenticated caller's session." };
  try {
    const current = await identityAccess.validateSession(payload.authSessionId);
    if (current?.user.id !== actor.userId) return { ok: false, requiresRecheck: true, error: "Secret key authorization must use the authenticated caller's identity." };
    if (options.requireTotp === false) {
      await identityAccess.authorizeSessionPasswordPin({
        sessionId: payload.authSessionId,
        password: payload.authorizationPassword,
        pin: payload.authorizationPin
      });
    } else {
      await identityAccess.authorizeSessionCredentials({
        sessionId: payload.authSessionId,
        password: payload.authorizationPassword,
        pin: payload.authorizationPin,
        totp: payload.authorizationTotp
      });
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      requiresRecheck: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
