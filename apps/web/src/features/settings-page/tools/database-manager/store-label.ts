/**
 * A store's name in plain words: the part after the last dot, with dashes and underscores as spaces and a capital
 * first letter ("secret.credential-unlocks" reads "Credential unlocks"). The engine's own id stays the store's key.
 */
export function storeLabel(kind: string): string {
  const last = kind.split(".").filter(Boolean).pop() ?? kind;
  const words = last.replace(/[-_]+/gu, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : kind;
}
