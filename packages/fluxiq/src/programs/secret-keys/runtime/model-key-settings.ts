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
    return {
      defaultKeyId: this.defaultKey()?.id ?? null,
      ...(notice ? { defaultNotice: notice } : {}),
      assistantKeyId: this.assistantKey()?.id ?? null,
      assistantModel: this.assistantModelFor(this.assistantKey() ?? this.defaultKey()) ?? null,
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

  /** The key and model the assistant should call, or a plain reason there is none. Carries no value. */
  async resolveAssistant(): Promise<AssistantModelChoice> {
    await this.load();
    const key = this.assistantKey() ?? this.defaultKey();
    if (!key) return { ok: false, reason: "Add a model key in Settings to use the assistant." };
    const model = this.assistantModelFor(key);
    return { ok: true, keyId: key.id, keyName: key.name, ...(key.provider ? { provider: key.provider } : {}), ...(model ? { model } : {}) };
  }

  /** Makes a model key the default, and clears the notice about the last change. Refuses a key that is missing, disabled or not a model key. */
  async setDefault(id: string): Promise<ModelKeySettingsView> {
    await this.load();
    const refusal = refusalFor(this.store.get(id), "use as the default");
    if (refusal) throw new Error(refusal);
    this.update({ defaultKeyId: id, defaultNotice: undefined });
    await this.persist();
    return this.view();
  }

  /** Sets the assistant's key (none: the default key) and model (none: the provider's normal one). */
  async setAssistant(input: { keyId?: string | undefined; model?: string | undefined }): Promise<ModelKeySettingsView> {
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
    this.update({ assistantKeyId: keyId, assistantModel: model, assistantModelProvider: model === undefined ? undefined : providerOf(key) });
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
    this.update({ defaultKeyId: this.modelKeys()[0]?.id });
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
      patch.defaultNotice = {
        message: next
          ? `Your default key ${loss.phrase}, so ${next.name} is now the default.`
          : `Your default key ${loss.phrase}, and there is no other model key. Add one in Settings.`,
        atMs: this.now()
      };
    }
    if (this.record?.assistantKeyId === loss.id) Object.assign(patch, { assistantKeyId: undefined, assistantModel: undefined, assistantModelProvider: undefined });
    if (Object.keys(patch).length === 0) return;
    this.update(patch);
    await this.persist();
  }

  private defaultKeyIsValid(): boolean {
    const chosen = this.record?.defaultKeyId;
    const key = chosen === undefined ? undefined : this.store.get(chosen);
    return key !== undefined && ModelKeySettings.isModelKey(key);
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
