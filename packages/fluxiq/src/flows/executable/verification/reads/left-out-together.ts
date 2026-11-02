import type { ResultItemMark } from "./item-mark.ts";

/** One set of conditions that left rows out together (`AutomationStudioResultReadAccount.leftOutTogether`): their numbers, from 1, and the rows by label. */

export type ResultLeftOutTogether = {
  conditions: number[]; rows: string[];
  /** Each row's own cells, in `rows`' order, screened as a condition's `leftOutCells` are (t771); absent where the read sent labels only. */
  cells?: Array<Record<string, string>>;
  /** Each row's marks, in `rows`' order, as a condition's `leftOutMarks` are (t810); absent where the read sent none. */
  marks?: Array<ResultItemMark[] | null>;
};
