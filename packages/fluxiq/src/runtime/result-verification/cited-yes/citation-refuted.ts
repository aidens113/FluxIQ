import type { AutomationStudioLlmVerificationChecked } from "../../llm/index.ts";
import { AutomationStudioRequestRowHandle, AutomationStudioRequestRowId } from "../request-rows/index.ts";

/** A cell as the located defects compare one: lower case, each run of spaces one, no closing stop (`../located-defects/row-cells.ts`). */
const fold = AutomationStudioRequestRowHandle.fold;

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** At most this many characters of a judge's words are said back. */
const SAID_MAX = 120;

function said(text: string): string {
  return text.length > SAID_MAX ? `${text.slice(0, SAID_MAX)}...` : text;
}

/** A cited row that is a whole positive number, written "3", "row 3" or "#3", is that stored row by position; none where it is not one or no row sits there. */
function positioned<T>(text: string, rows: readonly T[]): T[] {
  const match = /^(?:row\s*|#\s*)?(\d+)$/u.exec(text);
  const place = match ? Number(match[1]) : 0;
  const row = Number.isSafeInteger(place) && place >= 1 ? rows[place - 1] : undefined;
  return row === undefined ? [] : [row];
}

/** A cited row that is a handle (`../request-rows/row/handle.ts`) of a label two or more stored rows share is that row, by its rank among them; none where it is not one. */
function handled<T extends { label: string }>(text: string, rows: readonly T[]): T[] {
  const read = AutomationStudioRequestRowHandle.read(text);
  const sharing = read ? rows.filter((row) => fold(row.label) === fold(read.label)) : [];
  const row = read && sharing.length > 1 ? sharing[read.rank - 1] : undefined;
  return row === undefined ? [] : [row];
}

/**
 * The handles of the rows sharing a label that a cited row starts with, said so a judge can cite them: a judge that has only the
 * label to tell such rows apart by qualifies it ("label (ends ...)"). Nothing where the cited row starts with no shared label.
 */
function handlesStartingThe(text: string, rows: ReadonlyArray<{ label: string }>): string[] {
  const start = fold(text);
  const handles = AutomationStudioRequestRowHandle.of(rows.map((row) => row.label));
  return rows.flatMap((row, at) => handles[at] !== undefined && fold(row.label).length > 0 && start.startsWith(fold(row.label)) ? [handles[at]!] : []);
}

/**
 * Core's sentence for one cited cell it cannot find among the stored rows
 * (`./index.ts`), or nothing where it finds it: a stored row by its label (or
 * the id Core gave it, its handle where rows share a label, or its position among the stored rows where no label is that), holding the column, holding that value under the
 * comparison the located defects use. Never the stored cell itself.
 */
export function automationStudioResultCitationRefuted(cited: AutomationStudioLlmVerificationChecked, rows: ReadonlyArray<{ label: string; cells: Readonly<Record<string, string>> }>): string | undefined {
  const text = fold(AutomationStudioRequestRowId.unsaid(cited.row).replace(/^["“'‘]+|["”'’]+$/gu, ""));
  const byLabel = rows.filter((row) => fold(row.label) === text);
  // A label always wins; only a cited row no label names may be a handle (rank among the rows sharing a label), then a position (1-based, in the order the rows are held).
  const byHandle = byLabel.length ? [] : handled(text, rows);
  const named = byLabel.length ? byLabel : byHandle.length ? byHandle : positioned(text, rows);
  if (!named.length) {
    const handles = handlesStartingThe(text, rows);
    const hint = handles.length ? ` Rows that share a label are cited by that label and their rank among them (${handles.map((handle) => `"${said(handle)}"`).join(", ")}), or by the label as written.` : "";
    return `The cited row "${said(cited.row)}" is no row the result holds.${hint}`;
  }
  const column = bare(cited.column);
  const held = named.filter((row) => Object.keys(row.cells).some((key) => bare(key) === column));
  if (!held.length) return `The result stores no column "${said(cited.column)}" for the cited row "${said(cited.row)}".`;
  const value = fold(cited.value);
  const holds = held.some((row) => Object.entries(row.cells).some(([key, cell]) => bare(key) === column && fold(cell) === value));
  return holds ? undefined : `The result's cell "${said(cited.column)}" of the cited row "${said(cited.row)}" does not hold the value cited, "${said(cited.value)}".`;
}
