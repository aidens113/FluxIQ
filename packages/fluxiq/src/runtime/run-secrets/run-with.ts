import { automationStudioRunSecretsStore } from "./store.ts";

/**
 * Runs `fn` with `secrets` (each a run input's name and its text) as the run's secrets: what
 * `automationStudioRunSecrets` reads anywhere in `fn`'s async chain, and nowhere else. A run set inside
 * another keeps the outer run's secrets too, so a child run withholds its parent's; an inner name
 * wins. Empty texts are dropped: they withhold nothing.
 */
export function runWithAutomationStudioRunSecrets<T>(secrets: Readonly<Record<string, string>>, fn: () => T): T {
  const own = Object.fromEntries(Object.entries(secrets).filter(([, text]) => typeof text === "string" && text !== ""));
  const outer = automationStudioRunSecretsStore.getStore();
  if (!Object.keys(own).length && !outer) return fn();
  return automationStudioRunSecretsStore.run(Object.freeze({ ...(outer ?? {}), ...own }), fn);
}
