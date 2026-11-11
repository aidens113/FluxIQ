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
  /** The signed-in person added this key: theirs to offer to the workspace. Said by the server only of the caller's own keys. */
  heldByYou?: boolean | undefined;
  /** Its holder offered it to the workspace, so it may pay for other people's messages once it is chosen. */
  offeredToWorkspace?: boolean | undefined;
};

/** What `snapshot` and `get-assistant-model` say about the default and the assistant's pick. */
export type SettingsModelChoices = {
  defaultKeyId: string | null;
  defaultNotice?: { message: string; atMs: number } | undefined;
  assistantKeyId: string | null;
  assistantModel: string | null;
  /** The provider of the key the assistant uses now, as that key names it; null with no model key. */
  assistantProvider?: string | null | undefined;
  /** An owner or administrator chose the key the assistant uses now as the workspace's key. */
  assistantKeyChosen?: boolean | undefined;
  /** The holder of the key the assistant uses now offered it to the workspace. */
  assistantKeyOffered?: boolean | undefined;
  assistantAllowanceUsd: number | null;
  /**
   * Whether this person may change the workspace's choices: the default key,
   * and the assistant's key and model. The panel's own fact about the signed-in
   * person (`mayChooseWorkspaceKeys`), never part of the server's answer; the
   * server decides each change on the workspace in any case. Absent means they may.
   */
  mayChoose?: boolean | undefined;
};
