// The cause of a refusal, carried onto the same refusal given again.
//
// A domain may say a refusal it is about to give a second time, byte for byte,
// as `answered_the_same_again` in place of its cause, which the first of the
// run carried (the web domain's `repeated-refusal.ts`). The chat's card read
// that reason as nothing it knew and fell back to the code: a list read refused
// for its list (`malformed_handle`) and then refused the same way twice more
// read "Read list · Didn't work: it wasn't on the page" beside the list in
// plain sight (R2-U-6, live run `run-muwansvz-a2b4a987`, steps 0034, 0039 and
// 0046). The observer of one loop keeps each call's last cause and puts it
// back on the repeats, so the card says why.

/** The reason a repeat carries in place of its cause. */
const SAME_AGAIN = "answered_the_same_again";

/** What one call is, for its cause: its tool, the node it runs, and the code it came to. */
function keyOf(call: { toolId: string; value?: unknown }, code: string): string {
  const node = call.value && typeof call.value === "object" && !Array.isArray(call.value) ? (call.value as { node?: unknown }).node : undefined;
  return [call.toolId, typeof node === "string" ? node : "", code].join(" ");
}

/**
 * A memory of the last cause each call came to, for one loop: `of` returns the
 * reason a row should carry -- the cause the same call last came to with the
 * same code, where the domain said only that it answered the same again, and
 * the reason as given otherwise, which it keeps. A repeat it saw no cause for
 * keeps its own reason, which the card says as a repeat.
 */
export function automationStudioActivityRepeatedReason(): { of(call: { toolId: string; value?: unknown }, result: { code: string | undefined; reason: string | undefined }): string | undefined } {
  const causes = new Map<string, string>();
  return {
    of(call, { code, reason }) {
      if (code === undefined || reason === undefined) return reason;
      const key = keyOf(call, code);
      if (reason === SAME_AGAIN) return causes.get(key) ?? reason;
      causes.set(key, reason);
      return reason;
    }
  };
}
