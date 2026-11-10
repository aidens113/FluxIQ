// What the Settings page needs from the panel's program API, as a port so the
// sequences in this folder run against a fake in tests.

export type SettingsCallResult<T = unknown> = {
  ok: boolean;
  payload?: T;
  error?: string;
  /** The endpoint asked for the person's credentials again. */
  requiresRecheck?: boolean;
};

export type SettingsCallPayload = Record<string, unknown>;

/** Reads when `payload` is absent, posts when it is given. */
export type SettingsPort = {
  call<T = unknown>(programId: string, endpoint: string, payload?: SettingsCallPayload): Promise<SettingsCallResult<T>>;
};

/** One key as the page shows it. A value is never part of it. */
export type SettingsKey = {
  id: string;
  name: string;
  kind: "llm" | "custom";
  provider?: string | undefined;
  enabled: boolean;
  lastUsedAtMs?: number | undefined;
};

/** What `snapshot` and `get-assistant-model` say about the default and the assistant's pick. */
export type SettingsModelChoices = {
  defaultKeyId: string | null;
  defaultNotice?: { message: string; atMs: number } | undefined;
  assistantKeyId: string | null;
  assistantModel: string | null;
  assistantAllowanceUsd: number | null;
};
