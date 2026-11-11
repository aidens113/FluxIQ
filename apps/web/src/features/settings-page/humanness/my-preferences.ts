// The person's own preferences, read and written through identity-access. `get-my-preferences`
// answers `{ startingHumanness: number | null }`; `update-my-preferences` sets it, null clears it.
// Both act on the caller's own record only. Until the program has these endpoints the call
// fails, and the answer is "unavailable", never a thrown error.

import type { SettingsPort } from "../model";

export type MyPreferences = { startingHumanness: number | null };

export type MyPreferencesRead = { ok: true; preferences: MyPreferences } | { ok: false };

const PROGRAM = "identity-access";

/** A whole level 0-100, or null when absent or not one. */
export function startingHumannessFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

export async function readMyPreferences(port: SettingsPort): Promise<MyPreferencesRead> {
  try {
    const result = await port.call<{ startingHumanness?: unknown }>(PROGRAM, "get-my-preferences");
    if (!result.ok) return { ok: false };
    return { ok: true, preferences: { startingHumanness: startingHumannessFrom(result.payload?.startingHumanness) } };
  } catch {
    return { ok: false };
  }
}

/** Saves the starting value (null clears it). Answers the person's words on a refusal, "" when saved. */
export async function saveStartingHumanness(port: SettingsPort, startingHumanness: number | null): Promise<string> {
  try {
    const result = await port.call(PROGRAM, "update-my-preferences", { startingHumanness });
    return result.ok ? "" : result.error || "That did not save. Try again.";
  } catch {
    return "That did not save. Try again.";
  }
}
