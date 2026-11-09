// The field shapes FluxNode contracts share, so an id, a time or a cost is written the
// same way in a spec, a run, an event and an HTTP message.

import { z } from "zod";

/** No control characters: text a person reads, on one line or several. */
const PERSON_TEXT = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u;

/**
 * - `id`: an opaque identifier Core or a client minted (a run, a Flow, a step, an
 *   event, a dataset), 1 to 128 of `A-Z a-z 0-9 . _ : -`;
 * - `callerKey`: a correlation id or idempotency key the caller chose, the same
 *   characters, 1 to 128;
 * - `epochMs`: a time, in whole milliseconds since 1970;
 * - `count`: a whole number of at least 0;
 * - `usd`: dollars, a finite amount of at least 0;
 * - `sha256Hex`: 64 lowercase hex characters;
 * - `shortText`: a label for a person, 1 to 200 characters;
 * - `personText`: a sentence or more for a person, 1 to 4000 characters.
 */
export const fluxNodeFieldSchemas = Object.freeze({
  id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u, "1 to 128 of A-Z a-z 0-9 . _ : -"),
  callerKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u, "1 to 128 of A-Z a-z 0-9 . _ : -"),
  epochMs: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  usd: z.number().finite().nonnegative(),
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/u, "64 lowercase hex characters"),
  shortText: z.string().min(1).max(200).regex(PERSON_TEXT, "no control characters"),
  personText: z.string().min(1).max(4000).regex(PERSON_TEXT, "no control characters")
});
