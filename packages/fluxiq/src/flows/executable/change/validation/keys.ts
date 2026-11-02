export function hasOnlyKeys(keys: string[], allowed: string[]): boolean {
  return keys.every((key) => allowed.includes(key));
}
