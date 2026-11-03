// The unsent draft kept in memory only: a host whose conversation content must
// not reach the page's storage (`composer.keepDraft: false`). It lasts as long
// as the composer does and touches no storage of any kind.

import type { DraftStorage, OwnedDraft } from "./draft-storage.ts";

/** A draft that lives in this object alone. */
export function memoryDraftStorage(): DraftStorage {
  let text = "";
  let owned: OwnedDraft = { text: "", owner: null };
  return {
    read: () => text,
    write(next) {
      text = next;
    },
    readOwned: () => owned,
    writeOwned(next, owner) {
      owned = { text: next, owner };
    }
  };
}
