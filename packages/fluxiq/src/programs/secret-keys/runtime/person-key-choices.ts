// Each person's own choice of the key their own calls use, kept in the
// model-key settings record (`personKeyChoices`): set when they save a model
// key, for their own key only, and dropped when that key stops being a model
// key. Pure: `ModelKeySettings` owns the record and writes it (t928, F1).

import type { SecretKeyPersonChoice, SecretKeyRecord } from "../types.ts";

export const PersonKeyChoices = {
  /**
   * `userId`'s chosen key while it is still a model key they hold; a choice of
   * a key since removed, turned off or held by someone else reads as none.
   * `modelKeyById` answers only enabled model keys.
   */
  keyOf(choices: readonly SecretKeyPersonChoice[] | undefined, userId: string, modelKeyById: (id: string) => SecretKeyRecord | undefined): SecretKeyRecord | undefined {
    const keyId = choices?.find((choice) => choice.userId === userId)?.keyId;
    const key = keyId === undefined ? undefined : modelKeyById(keyId);
    return key?.createdBy === userId ? key : undefined;
  },

  /** The choices with `userId`'s set to `keyId`, in place of any earlier one of theirs; nobody else's changes. */
  chosen(choices: readonly SecretKeyPersonChoice[] | undefined, userId: string, keyId: string, atMs: number): SecretKeyPersonChoice[] {
    return [...(choices ?? []).filter((choice) => choice.userId !== userId), { userId, keyId, atMs }];
  },

  /** Whether any person chose `keyId`. */
  names(choices: readonly SecretKeyPersonChoice[] | undefined, keyId: string): boolean {
    return (choices ?? []).some((choice) => choice.keyId === keyId);
  },

  /** The choices without those of `keyId`, or undefined when none are left. */
  withoutKey(choices: readonly SecretKeyPersonChoice[] | undefined, keyId: string): SecretKeyPersonChoice[] | undefined {
    const kept = (choices ?? []).filter((choice) => choice.keyId !== keyId);
    return kept.length > 0 ? kept : undefined;
  }
} as const;
