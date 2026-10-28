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
export type AutomationStudioResultLeftOutObservation = {
  source: "field" | "read";
  readKind?: "text" | "attribute" | "value" | "link" | "column";
  page: number;
  item: number;
} & ({ state: "present"; value: string } | { state: "absent" | "unavailable" | "withheld"; value?: never });

/** Passive condition witness, retaining original text and no executable address or inferred eligibility. */
export type AutomationStudioResultConditionObservation = { conditionIndex: number } & AutomationStudioResultLeftOutObservation;

/** One condition of a read's account, in authored order (`./contracts/read-account.ts`, `conditions`). */
export type AutomationStudioResultReadCondition = {
  /**
   * The condition's place in the step's authored `where`, counting from 1:
   * the one index every line that names it says, as `condition N (wording)`
   * (`./read-account/condition-name.ts`, t574). Absent only on an account
   * built by hand, which is named by its position the same way.
   */
  number?: number;
  condition?: string; rejected?: number; alone?: number; leftOutOnlyByThis?: string[]; leftOutObservations?: Array<AutomationStudioResultLeftOutObservation | null>; testedLabel?: true;
  /**
   * How Core read the tested value on a few rows the condition kept and left
   * out (`./value-readings/`, t511): the number a bound compared, or the part
   * of the text a text test matched. Absent where no such row is known.
   */
  valuesRead?: string[];
  /**
   * For a condition that keeps a row only when its read finds a value (a
   * presence test), Core's sentence for both sides: its read found one on
   * every row it kept, with one such value where the read reported it, and
   * none on each row it alone left out (`./read-account/presence.ts`, t574).
   * Each of those rows is then said `label — column: (no value)`.
   */
  presence?: string;
  /**
   * The rows of `leftOutOnlyByThis`, as given there, whose tested value Core
   * read as a number that fails this condition's own numeric bound, or, for a
   * presence test, whose witness found the value absent (or present) as the
   * condition leaves out, or, for a text test, whose witness found a value
   * that fails it (`./value-readings/settled-rows.ts`, t574, t599, t624), and
   * `settled`, Core's sentence saying so and what a yes must still show: a
   * quote of the request's words stating that bound or asking for that value,
   * once. No yes is asked to quote the request beside each such row.
   */
  leftOutSettled?: string[];
  settled?: string;
  /** What kind of condition settled those rows (`./value-readings/settled-rows.ts`): carried so no later line re-parses its wording to tell. */
  settledKind?: "bound" | "presence" | "text";
  /**
   * On the judge's copy only (`./request-rows/summary-with-also-in-result.ts`,
   * t624): the rows of `leftOutOnlyByThis`, as given there, whose label is also
   * a row of the result -- another copy of the same item was kept -- and
   * `alsoInResult`, Core's sentence saying so.
   */
  leftOutAlsoInResult?: string[];
  alsoInResult?: string;
};
