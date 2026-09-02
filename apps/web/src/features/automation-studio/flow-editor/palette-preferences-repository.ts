export const NODE_PALETTE_FAVORITES_STORAGE_KEY = "fluxiq:node-palette:favorites";
export const NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS = 25_000;

export type NodePalettePreferencesRepository = {
  readFavorites(): string[];
  saveFavorites(favorites: string[]): void;
};

export const browserNodePalettePreferencesRepository: NodePalettePreferencesRepository = {
  readFavorites: readNodePaletteFavoritesFromLocalStorage,
  saveFavorites: saveNodePaletteFavoritesToLocalStorage
};

export function readNodePaletteFavoritesFromLocalStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const storage = window.localStorage;
    if (!storage) return [];
    const raw = storage.getItem(NODE_PALETTE_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    if (raw.length > NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS) { storage.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY); return []; }
    const stored = JSON.parse(raw);
    return Array.isArray(stored) ? [...new Set(stored.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    try { window.localStorage?.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY); } catch {}
    return [];
  }
}

export function saveNodePaletteFavoritesToLocalStorage(next: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const storage = window.localStorage;
    if (!storage) return;
    const raw = JSON.stringify([...new Set(next)]);
    if (raw.length > NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS) { storage.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY); return; }
    storage.setItem(NODE_PALETTE_FAVORITES_STORAGE_KEY, raw);
  } catch {
    // Browser privacy settings may make storage unavailable; the in-memory selection remains usable.
  }
}
