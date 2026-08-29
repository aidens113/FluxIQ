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
  if (typeof window === "undefined" || !window.localStorage) return [];
  const raw = window.localStorage.getItem(NODE_PALETTE_FAVORITES_STORAGE_KEY);
  if (!raw) return [];
  if (raw.length > NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS) {
    window.localStorage.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY);
    return [];
  }
  try {
    const stored = JSON.parse(raw);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    window.localStorage.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY);
    return [];
  }
}

export function saveNodePaletteFavoritesToLocalStorage(next: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = JSON.stringify(next);
  if (raw.length > NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS) {
    window.localStorage.removeItem(NODE_PALETTE_FAVORITES_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(NODE_PALETTE_FAVORITES_STORAGE_KEY, raw);
}