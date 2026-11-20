// Test support: the host's free key check, scripted. `probe` answers the verdict set with `answer` (default: the
// provider answered) and keeps every probe in order; `record` keeps every verdict recorded on a stored key. Nothing
// reaches a provider.

import type { SecretKeyCheckVerdict, SecretKeySavedKeyCheck } from "../saved-key-check.ts";

export function scriptedKeyCheck(initial: SecretKeyCheckVerdict = { outcome: "answered" }) {
  let verdict = initial;
  const probed: Array<{ provider: string; value: string }> = [];
  const recorded: Array<{ id: string; lastRotatedAtMs: number; outcome: SecretKeyCheckVerdict["outcome"] }> = [];
  const check: SecretKeySavedKeyCheck = {
    probe: async (input) => {
      probed.push({ ...input });
      return verdict;
    },
    record: (key, given) => {
      recorded.push({ id: key.id, lastRotatedAtMs: key.lastRotatedAtMs, outcome: given.outcome });
    }
  };
  return { check, probed, recorded, answer: (next: SecretKeyCheckVerdict) => { verdict = next; } };
}
