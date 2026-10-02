/**
 * The raw record a tool row carries in `detail.text`: "Result: <code> ·
 * Reason: <reason> · Node: <node id>", each part optional
 * (`programs/automation-studio/runtime/activity/observer.ts`). The reason is
 * the caller's own code for why a call came to its result. Read only to
 * classify the row and say why it failed; no value is ever shown.
 */
export function activityActionRecordOf(text: string | undefined): { resultCode: string | undefined; reason?: string | undefined; node: string | undefined } {
  if (!text) return { resultCode: undefined, node: undefined };
  const reason = /(?:^|·\s*)Reason: (\S+)/u.exec(text)?.[1];
  return {
    resultCode: /(?:^|·\s*)Result: (\S+)/u.exec(text)?.[1],
    ...(reason === undefined ? {} : { reason }),
    node: /(?:^|·\s*)Node: (\S+)/u.exec(text)?.[1]
  };
}
