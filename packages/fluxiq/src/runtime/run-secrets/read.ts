import { automationStudioRunSecretsStore } from "./store.ts";

/**
 * The current run's secrets, each a run input's name and its text, or nothing outside every run that
 * has one. Read where a value is resolved (so a step bound to a secret input types it) and where text
 * leaves the run (so it is withheld there).
 */
export function automationStudioRunSecrets(): Readonly<Record<string, string>> | undefined {
  const secrets = automationStudioRunSecretsStore.getStore();
  return secrets && Object.keys(secrets).length ? secrets : undefined;
}
