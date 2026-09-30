/**
 * The raw record a tool row carries in `detail.text`: "Result: <code> · Node:
 * <node id>", either part optional
 * (`programs/automation-studio/runtime/activity/observer.ts`). Read only to
 * classify the row; neither value is ever shown.
 */
export function activityActionRecordOf(text: string | undefined): { resultCode: string | undefined; node: string | undefined } {
  if (!text) return { resultCode: undefined, node: undefined };
  return {
    resultCode: /(?:^|·\s*)Result: (\S+)/u.exec(text)?.[1],
    node: /(?:^|·\s*)Node: (\S+)/u.exec(text)?.[1]
  };
}
