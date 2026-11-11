import type { SettingsKey } from "./types";

export type KeyRow = {
  id: string;
  name: string;
  provider: string;
  status: "On" | "Off";
  isDefault: boolean;
  /** The signed-in person added it, so they may offer it to the workspace. */
  heldByYou: boolean;
  /** Its holder offered it to the workspace. */
  offered: boolean;
  /** Said only when the engine knows it; absent otherwise. */
  lastUsed?: string;
};

/**
 * The model keys, in the order given, as list rows. Only model keys (not custom
 * secrets) belong in AI keys. The default is the stored default while it is
 * still an enabled model key, else the first enabled one, which is what the
 * engine does too.
 */
export function keyRows(keys: readonly SettingsKey[], defaultKeyId: string | null, formatTime: (ms: number) => string): KeyRow[] {
  const models = keys.filter((key) => key.kind === "llm");
  const effective = models.find((key) => key.id === defaultKeyId && key.enabled) ?? models.find((key) => key.enabled);
  return models.map((key) => ({
    id: key.id,
    name: key.name,
    provider: key.provider?.trim() || "Not set",
    status: key.enabled ? "On" : "Off",
    isDefault: key.id === effective?.id,
    heldByYou: key.heldByYou === true,
    offered: key.offeredToWorkspace === true,
    ...(key.lastUsedAtMs ? { lastUsed: formatTime(key.lastUsedAtMs) } : {})
  }));
}
