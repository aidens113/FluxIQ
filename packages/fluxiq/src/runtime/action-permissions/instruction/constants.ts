

import { ACTION_INSTRUCTION_READING_BOUNDS } from "./bounds.ts";
export const permissionConstants = Object.freeze({
  ...ACTION_INSTRUCTION_READING_BOUNDS,
  ID: /^[A-Za-z0-9._:-]{1,200}$/,
  DIGEST: /^sha256:[0-9a-f]{64}$/,
});
