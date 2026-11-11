import type { JsonObject } from "../../../core/index.ts";
import { createRecord, type Repository } from "../../database-manager/index.ts";
import type { AssistantModelChoice, ModelKeySettingsRecord, ModelKeySettingsView, SecretKeyRecord } from "../types.ts";
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
   * none. Carries no value. Names the key's owner, and whether that owner chose
   * it as the workspace's key (`sharedByOwner`), which is what lets it pay for
   * another person's message: never a key someone else picked for them, nor a
   * default that passed to it on its own.
   */
  async resolveAssistant(): Promise<AssistantModelChoice> {
    await this.load();
    const key = this.assistantKey() ?? this.defaultKey();
    if (!key) return { ok: false, reason: "Add a model key in Settings to use the assistant." };
    const model = this.assistantModelFor(key);
    return { ok: true, keyId: key.id, keyName: key.name, ...(key.provider ? { provider: key.provider } : {}), ...(model ? { model } : {}), ...(key.createdBy ? { ownerId: key.createdBy } : {}), sharedByOwner: this.chosenByOwner(key) };
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
   * After a key was created: the workspace's first model key, while no default is
   * recorded, becomes the default by its creator's own act of adding it (Settings
   * already shows it as "the default key"), so it is recorded as theirs.
   */
  async keyCreated(key: SecretKeyRecord): Promise<void> {
    await this.load();
    if (this.record?.defaultKeyId !== undefined || !key.createdBy || this.defaultKey()?.id !== key.id) return;
    this.update({ defaultKeyId: key.id, defaultChosenBy: key.createdBy });
    await this.persist();
  }

  /** Sets the assistant's key (none: the default key) and model (none: the provider's normal one). `chosenBy` is the acting user. */
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
    this.update({ assistantKeyId: keyId, assistantChosenBy: input.chosenBy, assistantModel: model, assistantModelProvider: model === undefined ? undefined : providerOf(key) });
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
   * notice; an assistant choice that pointed at it goes back to "the default".
   */
  async keyLost(loss: DefaultKeyLoss): Promise<void> {
    const patch: Partial<ModelKeySettingsRecord> = {};
    if (loss.wasDefault) {
      const next = this.modelKeys().find((key) => key.id !== loss.id);
      patch.defaultKeyId = next?.id;
      // Passed on by itself, so nobody chose it: it pays for no one else's messages until its owner picks it.
      patch.defaultChosenBy = undefined;
      patch.defaultNotice = {
        message: next
          ? `Your default key ${loss.phrase}, so ${next.name} is now the default.`
          : `Your default key ${loss.phrase}, and there is no other model key. Add one in Settings.`,
        atMs: this.now()
      };
    }
    if (this.record?.assistantKeyId === loss.id) Object.assign(patch, { assistantKeyId: undefined, assistantChosenBy: undefined, assistantModel: undefined, assistantModelProvider: undefined });
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
   * Whether `key`, the one the assistant uses now, was chosen for the workspace by
   * its own owner: picked for the assistant by them, or the default they chose
   * (or added first), or "the default key" picked for the assistant by them when
   * the default is theirs. A key with no owner stamp is nobody's to share.
   */
  private chosenByOwner(key: SecretKeyRecord): boolean {
    const owner = key.createdBy;
    const record = this.record;
    if (!owner || !record) return false;
    if (this.assistantKey()?.id === key.id) return record.assistantChosenBy === owner;
    if (record.defaultKeyId === key.id && record.defaultChosenBy === owner) return true;
    return record.assistantKeyId === undefined && record.assistantChosenBy === owner;
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
