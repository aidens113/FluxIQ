import type { SettingsKey, SettingsModelChoices } from "./types";

/**
 * Whether the engine's note about a default key that went away ("Your default key was removed ...") can still be
 * true. It is stale once a key was added after it was written: the note describes the keys as they were, and the
 * engine keeps it until a default is chosen again. No word of the note is read, only when it was written.
 */
export function defaultNoticeStillTrue(notice: SettingsModelChoices["defaultNotice"], keys: readonly SettingsKey[]): boolean {
  if (!notice) return false;
  return !keys.some((key) => key.kind === "llm" && typeof key.createdAtMs === "number" && key.createdAtMs > notice.atMs);
}
