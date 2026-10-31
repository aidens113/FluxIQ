import path from "node:path";

/** A comma list of module paths: trimmed, empties dropped, resolved, duplicates dropped. */
export function parseHostModulePaths(value: string | undefined): string[] {
  const resolved = (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => path.resolve(entry));
  return [...new Set(resolved)];
}
