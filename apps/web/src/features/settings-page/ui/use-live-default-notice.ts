"use client";

import { useState } from "react";
import { defaultNoticeStillTrue, type SettingsKey, type SettingsModelChoices } from "../model";

/** What the keys looked like when a note was first seen: the key ids and which one is the default. */
const shape = (keys: readonly SettingsKey[], defaultKeyId: string | null) => `${defaultKeyId ?? ""}|${keys.map((key) => key.id).join(",")}`;

/**
 * The engine's note about a lost default key, while it is still true: shown from when it is first seen until the
 * keys change (one added, removed or made the default) or a newer key exists than the note. Answers "" when there
 * is nothing to say.
 */
export function useLiveDefaultNotice(notice: SettingsModelChoices["defaultNotice"], keys: readonly SettingsKey[], defaultKeyId: string | null): string {
  const now = shape(keys, defaultKeyId);
  const [seen, setSeen] = useState<{ atMs: number; shape: string } | null>(null);
  if (!notice) {
    if (seen) setSeen(null);
    return "";
  }
  if (!seen || seen.atMs !== notice.atMs) {
    setSeen({ atMs: notice.atMs, shape: now });
    return defaultNoticeStillTrue(notice, keys) ? notice.message : "";
  }
  return seen.shape === now && defaultNoticeStillTrue(notice, keys) ? notice.message : "";
}
