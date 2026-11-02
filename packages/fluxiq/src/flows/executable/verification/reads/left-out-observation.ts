// One condition of a list read's account (`./contracts/read-account.ts`,
// `AutomationStudioResultReadAccount.conditions`), and the witness of its read
// on each row it alone left out. Its own file since t574 added the condition's
// number, its presence sentence and the rows Core settled, which took the
// contract past its line budget.

/**
 * A condition witness as a read's account carries it, under the condition it
 * witnesses: that condition's `number` is its only index (t574), so it names
 * none of its own. The domain's 0-based `conditionIndex` is read and checked
 * on the way in (`./condition-observation/`) and dropped as the witness is
 * placed under its condition (`./read-account/accounts.ts`): live run
 * `run-mv7vor5f-ea4d08b4`'s judges were shown it beside Core's 1-based
 * "condition 2" and matched rows to the wrong conditions.
 */

export type ResultLeftOutObservation = {
  source: "field" | "read";
  readKind?: "text" | "attribute" | "value" | "link" | "column";
  page: number;
  item: number;
} & ({ state: "present"; value: string } | { state: "absent" | "unavailable" | "withheld"; value?: never });
