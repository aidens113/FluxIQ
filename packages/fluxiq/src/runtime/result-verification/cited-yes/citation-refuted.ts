import type { AutomationStudioLlmVerificationChecked } from "../../llm/index.ts";
import { AutomationStudioRequestRowId } from "../request-rows/index.ts";

/** A cell as the located defects compare one: lower case, each run of spaces one, no closing stop (`../located-defects/row-cells.ts`). */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** At most this many characters of a judge's words are said back. */
const SAID_MAX = 120;

function said(text: string): string {
  return text.length > SAID_MAX ? `${text.slice(0, SAID_MAX)}...` : text;
}

/**
 * Core's sentence for one cited cell it cannot find among the stored rows
 * (`./index.ts`), or nothing where it finds it: a stored row by its label (or
 * the id Core gave it), holding the column, holding that value under the
 * comparison the located defects use. Never the stored cell itself.
 */
export function automationStudioResultCitationRefuted(cited: AutomationStudioLlmVerificationChecked, rows: ReadonlyArray<{ label: string; cells: Readonly<Record<string, string>> }>): string | undefined {
  const text = fold(AutomationStudioRequestRowId.unsaid(cited.row).replace(/^["“'‘]+|["”'’]+$/gu, ""));
  const named = rows.filter((row) => fold(row.label) === text);
  if (!named.length) return `The cited row "${said(cited.row)}" is no row the result holds.`;
  const column = bare(cited.column);
  const held = named.filter((row) => Object.keys(row.cells).some((key) => bare(key) === column));
  if (!held.length) return `The result stores no column "${said(cited.column)}" for the cited row "${said(cited.row)}".`;
  const value = fold(cited.value);
  const holds = held.some((row) => Object.entries(row.cells).some(([key, cell]) => bare(key) === column && fold(cell) === value));
  return holds ? undefined : `The result's cell "${said(cited.column)}" of the cited row "${said(cited.row)}" does not hold the value cited, "${said(cited.value)}".`;
}
