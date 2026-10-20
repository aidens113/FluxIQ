// Host words for the shared module's own tests (`host-words.ts`). They are
// neither the extension's nor Core web's, so a test that sees them knows the
// headline came from the words the host passed and from nowhere else.

import type { ActivityHostWords } from "../host-words.ts";

export const TEST_HOST_WORDS: ActivityHostWords = Object.freeze({
  answer: "Waiting for you: answer in the test host",
  check: "Waiting for you: finish the check in the test host"
});
