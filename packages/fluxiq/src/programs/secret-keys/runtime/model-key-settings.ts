import type { JsonObject } from "../../../core/index.ts";
import { createRecord, type Repository } from "../../database-manager/index.ts";
import type { AssistantModelChoice, ModelKeySettingsRecord, ModelKeySettingsView, SecretKeyOffer, SecretKeyRecord } from "../types.ts";
import type { SecretKeyStore } from "./key-store.ts";
import { RecordWriteQueue } from "./record-write-queue.ts";

const SETTINGS_ID = "secret-keys:model-settings";
const MAX_MODEL_ID_LENGTH = 200;

/** Why the default key stopped being one, in the words of the notice. */
export type DefaultKeyLoss = {
  id: string;
  /** Whether it was the default just before it stopped being a model key (`defaultKey()` read first). */
  wasDefault: boolean;
  phrase: "was removed" | "was disabled" | "is no longer a model key";
};

/**
 * Which model key is the default, and what the panel assistant uses. The choices
 * live in one small record beside the keys (never a value); the default is the
 * first enabled model key until a person picks another, and an absent record
 * reads that way, so a workspace made before it needs no migration. A model key
 * is an enabled key of kind `llm`; a disabled key is never the default.
 *
 * No key is ever shared automatically. A key pays for another person's
 * assistant message only when both hold: an owner or administrator chose it as
 * the workspace's key (`setDefault`, `setAssistant`, both decided on the
 * workspace), and its holder offered it to the workspace (`setOffered`, their
 * own act, for their own key). Adding a key, even the workspace's first, does
 * neither.
 */
export class ModelKeySettings {
  private record: ModelKeySettingsRecord | undefined;
  private readonly writes = new RecordWriteQueue();
  private readonly repository: Repository | undefined;
  private readonly kind: string;
  private readonly store: SecretKeyStore;
  private readonly now: () => number;
  private loading: Promise<void> | undefined;

  constructor(options: { repository: Repository | undefined; kind: string; store: SecretKeyStore; now: () => number }) {
    this.repository = options.repository;
    this.kind = options.kind;
    this.store = options.store;
    this.now = options.now;
  }

  /** An enabled key of kind `llm`: the only kind that can be the default or run the assistant. */
  static isModelKey(record: SecretKeyRecord): boolean {
    return record.enabled && record.kind === "llm";
  }

  /** Loads once; a failed read is retried by the next caller. */
  load(): Promise<void> {
    this.loading ??= this.readStored().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  /** The workspace's default key now: the chosen one while it is still a model key, else the oldest model key. */
  defaultKey(): SecretKeyRecord | undefined {
    const chosen = this.record?.defaultKeyId;
    const kept = chosen === undefined ? undefined : this.store.get(chosen);
    return kept && ModelKeySettings.isModelKey(kept) ? kept : this.modelKeys()[0];
  }

  /** The choices now, read from the store first. */
  async read(): Promise<ModelKeySettingsView> {
    await this.load();
    return this.view();
  }

  view(): ModelKeySettingsView {
    const notice = this.record?.defaultNotice;
    const effective = this.assistantKey() ?? this.defaultKey();
    return {
      defaultKeyId: this.defaultKey()?.id ?? null,
      ...(notice ? { defaultNotice: notice } : {}),
      assistantKeyId: this.assistantKey()?.id ?? null,
      assistantModel: this.assistantModelFor(effective) ?? null,
      assistantProvider: effective?.provider?.trim() || null,
      assistantKeyChosen: effective ? this.chosenForWorkspace(effective) : false,
      assistantKeyOffered: effective ? this.isOffered(effective) : false,
      assistantAllowanceUsd: this.record?.assistantAllowanceUsd ?? null
    };
  }

  /** What one message to the assistant may spend, in US dollars, when a person chose it; undefined means the assistant's default. */
  async assistantAllowance(): Promise<number | undefined> {
    await this.load();
    return this.record?.assistantAllowanceUsd;
  }

  /** Sets what one message to the assistant may spend (undefined: back to the default). Refuses anything but a finite number of dollars, zero or more. */
  async setAssistantAllowance(usd: number | undefined): Promise<number | undefined> {
    await this.load();
    if (usd !== undefined && (!Number.isFinite(usd) || usd < 0)) throw new Error("A spending allowance is a number of dollars, zero or more.");
    this.update({ assistantAllowanceUsd: usd });
    await this.persist();
    return this.record?.assistantAllowanceUsd;
  }

  /**
   * The key and model the assistant should call, or a plain reason there is
   * none. Carries no value. Names the key's holder, whether an owner or
   * administrator chose it as the workspace's key (`chosenForWorkspace`), and
   * whether its holder offered it to the workspace (`offeredByHolder`): only
   * both together let it pay for another person's message.
   */
  async resolveAssistant(): Promise<AssistantModelChoice> {
    await this.load();
    const key = this.assistantKey() ?? this.defaultKey();
    if (!key) return { ok: false, reason: "Add a model key in Settings to use the assistant." };
    const model = this.assistantModelFor(key);
    return { ok: true, keyId: key.id, keyName: key.name, ...(key.provider ? { provider: key.provider } : {}), ...(model ? { model } : {}), ...(key.createdBy ? { ownerId: key.createdBy } : {}), chosenForWorkspace: this.chosenForWorkspace(key), offeredByHolder: this.isOffered(key) };
  }

  /** Whether the key's holder offered it to the workspace, and the offer still stands. A key nobody is stamped on has no holder to offer it. */
  isOffered(key: SecretKeyRecord): boolean {
    const holder = key.createdBy;
    return holder !== undefined && (this.record?.keyOffers ?? []).some((offer) => offer.keyId === key.id && offer.holderId === holder);
  }

  /** Whether the key with this id is offered to the workspace by its holder, read from the store first; false for a missing key. */
  async offeredById(id: string): Promise<boolean> {
    await this.load();
    const key = this.store.get(id);
    return key !== undefined && this.isOffered(key);
  }

  /**
   * The holder offers their own key to the workspace (`offered` true), or
   * withdraws the offer. `holderId` is the acting user, never a payload; anyone
   * but the person who added the key is refused, an owner or administrator
   * included, so nobody offers another person's key. Only an enabled model key
   * is offered; a withdrawal is always taken.
   */
  async setOffered(id: string, offered: boolean, holderId: string): Promise<{ keyId: string; offered: boolean }> {
    await this.load();
    const key = this.store.get(id);
    if (!key) throw new Error("That key does not exist.");
    if (!key.createdBy || key.createdBy !== holderId) throw new Error("Only the person who added a key can offer it to the workspace.");
    if (offered) {
      const refusal = refusalFor(key, "be offered to the workspace");
      if (refusal) throw new Error(refusal);
    }
    const others = (this.record?.keyOffers ?? []).filter((offer) => offer.keyId !== id);
    const offers: SecretKeyOffer[] = offered ? [...others, { keyId: id, holderId, atMs: this.now() }] : others;
    this.update({ keyOffers: offers.length > 0 ? offers : undefined });
    await this.persist();
    return { keyId: id, offered };
  }

  /**
   * Makes a model key the default, and clears the notice about the last change.
   * Refuses a key that is missing, disabled or not a model key. `chosenBy` is the
   * person choosing (the acting user, never a payload).
   */
  async setDefault(id: string, chosenBy?: string): Promise<ModelKeySettingsView> {
    await this.load();
    const refusal = refusalFor(this.store.get(id), "use as the default");
    if (refusal) throw new Error(refusal);
    this.update({ defaultKeyId: id, defaultChosenBy: chosenBy, defaultNotice: undefined });
    await this.persist();
    return this.view();
  }

  /**
   * Sets the assistant's key (none: the default key) and model (none: the
   * provider's normal one). `chosenBy` is the acting user. Choosing "the
   * default key" chooses the default it names now: it is recorded as that
   * person's choice of default, so a default that later passes on by itself is
   * never taken as chosen.
   */
  async setAssistant(input: { keyId?: string | undefined; model?: string | undefined; chosenBy?: string | undefined }): Promise<ModelKeySettingsView> {
    await this.load();
    const keyId = input.keyId?.trim() || undefined;
    const chosen = keyId === undefined ? undefined : this.store.get(keyId);
    if (keyId !== undefined) {
      const refusal = refusalFor(chosen, "use for the assistant");
      if (refusal) throw new Error(refusal);
    }
    const model = input.model?.trim() || undefined;
    if (model !== undefined && model.length > MAX_MODEL_ID_LENGTH) throw new Error("That model name is too long.");
    const key = chosen ?? this.defaultKey();
    if (model !== undefined && !key) throw new Error("Add a model key in Settings before choosing a model.");
    const pinsDefault = keyId === undefined && key !== undefined && input.chosenBy !== undefined && !(this.record?.defaultKeyId === key.id && this.record.defaultChosenBy !== undefined);
    this.update({ assistantKeyId: keyId, assistantChosenBy: input.chosenBy, assistantModel: model, assistantModelProvider: model === undefined ? undefined : providerOf(key), ...(pinsDefault ? { defaultKeyId: key.id, defaultChosenBy: input.chosenBy } : {}) });
    await this.persist();
    return this.view();
  }

  /**
   * After a key was created or turned back into a model key. With nothing chosen
   * yet, the oldest model key already reads as the default (the first key
   * created), so nothing is written; a chosen default that is no longer a model
   * key is replaced by it.
   */
  async ensureDefault(): Promise<void> {
    if (this.record?.defaultKeyId === undefined || this.defaultKeyIsValid()) return;
    this.update({ defaultKeyId: this.modelKeys()[0]?.id, defaultChosenBy: undefined });
    await this.persist();
  }

  /**
   * After a key stopped being a model key, whether disabled, edited or deleted:
   * a default that was lost passes to the next enabled key, oldest first, with a
   * notice; an assistant choice that pointed at it goes back to "the default";
   * its holder's offer goes, so turning it back on shares nothing until they
   * offer it again.
   */
  async keyLost(loss: DefaultKeyLoss): Promise<void> {
    const patch: Partial<ModelKeySettingsRecord> = {};
    if (loss.wasDefault) {
      const next = this.modelKeys().find((key) => key.id !== loss.id);
      patch.defaultKeyId = next?.id;
      // Passed on by itself, so nobody chose it: it pays for no one else's messages until an owner or administrator chooses it.
      patch.defaultChosenBy = undefined;
      patch.defaultNotice = {
        message: next
          ? `Your default key ${loss.phrase}, so ${next.name} is now the default.`
          : `Your default key ${loss.phrase}, and there is no other model key. Add one in Settings.`,
        atMs: this.now()
      };
    }
    if (this.record?.assistantKeyId === loss.id) Object.assign(patch, { assistantKeyId: undefined, assistantChosenBy: undefined, assistantModel: undefined, assistantModelProvider: undefined });
    const offers = this.record?.keyOffers;
    if (offers?.some((offer) => offer.keyId === loss.id)) {
      const kept = offers.filter((offer) => offer.keyId !== loss.id);
      patch.keyOffers = kept.length > 0 ? kept : undefined;
    }
    if (Object.keys(patch).length === 0) return;
    this.update(patch);
    await this.persist();
  }

  private defaultKeyIsValid(): boolean {
    const chosen = this.record?.defaultKeyId;
    const key = chosen === undefined ? undefined : this.store.get(chosen);
    return key !== undefined && ModelKeySettings.isModelKey(key);
  }

  /**
   * Whether `key`, the one the assistant uses now, was chosen as the
   * workspace's key by someone's explicit act: picked for the assistant, or
   * chosen as the default (directly, or as "the default key" for the
   * assistant, which pins it). Both acts are decided on the workspace, so the
   * chooser is an owner or administrator (or, locally, a role with
   * `secrets.manage`). The oldest key standing as the default, or a default
   * that passed on by itself, was chosen by nobody.
   */
  private chosenForWorkspace(key: SecretKeyRecord): boolean {
    const record = this.record;
    if (!record) return false;
    if (this.assistantKey()?.id === key.id) return record.assistantChosenBy !== undefined;
    return record.defaultKeyId === key.id && record.defaultChosenBy !== undefined;
  }

  private assistantKey(): SecretKeyRecord | undefined {
    const id = this.record?.assistantKeyId;
    const key = id === undefined ? undefined : this.store.get(id);
    return key && ModelKeySettings.isModelKey(key) ? key : undefined;
  }

  /** The chosen model, only for the provider it was chosen for. */
  private assistantModelFor(key: SecretKeyRecord | undefined): string | undefined {
    const model = this.record?.assistantModel;
    if (!model || !key) return undefined;
    return providerOf(key) === this.record?.assistantModelProvider ? model : undefined;
  }

  /** Enabled model keys, oldest first. */
  private modelKeys(): SecretKeyRecord[] {
    return this.store.list().filter(ModelKeySettings.isModelKey).sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id));
  }

  private update(patch: Partial<ModelKeySettingsRecord>): void {
    this.record = { ...(this.record ?? { recordType: "secret-keys-model-settings", id: SETTINGS_ID }), ...patch, updatedAtMs: this.now() } as ModelKeySettingsRecord;
  }

  private persist(): Promise<void> {
    const repository = this.repository;
    if (!repository) return Promise.resolve();
    return this.writes.enqueue(SETTINGS_ID, async () => {
      if (this.record) await repository.put(createRecord({ id: SETTINGS_ID, kind: this.kind, data: this.record as unknown as JsonObject }));
    });
  }

  private async readStored(): Promise<void> {
    await this.store.load();
    const row = this.store.otherRow(SETTINGS_ID);
    if (isSettingsRecord(row)) this.record = row;
  }
}

function providerOf(key: SecretKeyRecord | undefined): string {
  return key?.provider?.trim().toLowerCase() ?? "";
}

/** The plain reason a key cannot be chosen, or undefined when it can. `purpose` finishes "That key cannot ..." sentences. */
function refusalFor(key: SecretKeyRecord | undefined, purpose: string): string | undefined {
  if (!key) return "That key does not exist.";
  if (key.kind !== "llm") return `That key is not a model key, so it cannot ${purpose}.`;
  if (!key.enabled) return `That key is turned off, so it cannot ${purpose}. Turn it on first.`;
  return undefined;
}

function isSettingsRecord(value: unknown): value is ModelKeySettingsRecord {
  return value !== null && typeof value === "object" && (value as { recordType?: unknown }).recordType === "secret-keys-model-settings";
}
