// Command-id translation in a recorded message (traces and offline trials,
// P4b). A recorded answer names the command id the original gateway minted;
// the trial's gateway minted another for the same matched operation. Every
// occurrence of a recorded id, as a JSON string (with its quotes, so `cmd-1`
// never matches inside `cmd-10`), is replaced by the new id as a JSON string.
// That is correlation bookkeeping, not evidence: every other byte of the
// recorded text is fed unchanged.

/** `ids`: each matched operation's recorded command id to the id the trial's gateway gave it. */
export function translateClientGatewayTraceCommandIds(text: string, ids: ReadonlyMap<string, string>): string {
  let translated = text;
  for (const [recorded, current] of ids) translated = translated.replaceAll(JSON.stringify(recorded), JSON.stringify(current));
  return translated;
}
