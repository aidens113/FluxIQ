// The other names the data stage knows for the result's stored fields (t1074), from evidence the framework holds:
//
// - **A renamed read.** The output read's own `fields` say which key each named column is read from (`title` from
//   `link_text`). A declaration written over the keys an earlier read held still names those keys after the result
//   moves to the renamed read; each such key names its new column (run-mwyfx9fs-06a170bf, 0067-0081).
// - **The request's columns.** Where the request names its columns surely, each is placed on the stored field that holds
//   it by name, by its values or by the declaration's own order (`automationStudioRecordAskedColumns`, contracts), and
//   names that field (run-mwyn25dg-3ba0b41c: `bids` held as `text_5`).
//
// Binding tries an alias only after an exact id and a unique label (`bindAutomationStudioRecordProcessing`). `text` says
// the placing to the model in ids and the request's own names only, never a cell's value.
import { automationStudioRecordAskedColumns, type AutomationStudioRecordAskedColumns, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

export type AutomationStudioAnswerFirstColumnNames = { aliases: Record<string, string>; asked?: AutomationStudioRecordAskedColumns; text?: string };

const BY: Record<AutomationStudioRecordAskedColumns["held"][number]["by"], string> = { name: "", values: " (its values name it)", order: " (the declaration's order)" };

export function automationStudioAnswerFirstColumnNames(input: { schema: AutomationStudioRecordSchema; rows: readonly Readonly<Record<string, unknown>>[]; asked?: readonly string[] | undefined; renamed?: Readonly<Record<string, string>> | undefined; columns?: readonly string[] | undefined }): AutomationStudioAnswerFirstColumnNames {
  const ids = new Set(input.schema.fields.map((field) => field.id));
  const aliases: Record<string, string> = {};
  for (const [key, column] of Object.entries(input.renamed ?? {})) if (!ids.has(key) && ids.has(column)) aliases[key] = column;
  if (!input.asked?.length) return { aliases };
  const asked = automationStudioRecordAskedColumns({ asked: input.asked, schema: input.schema, rows: input.rows, columns: input.columns });
  for (const { asked: name, field } of asked.held) if (!ids.has(name)) aliases[name] = field;
  if (asked.held.every(({ asked: name, field }) => name === field) && !asked.unheld.length) return { aliases, asked };
  const held = asked.held.map(({ asked: name, field, by }) => `${name} is ${field}${BY[by]}`);
  const text = [
    held.length ? `The request's columns on these rows: ${held.join(", ")}. The answer shows each under the request's name, and processing may name either.` : "",
    asked.unheld.length ? `No field is known to hold ${asked.unheld.join(", ")}: list columns in the request's order, or name the field that holds each.` : ""
  ].filter(Boolean).join(" ");
  return { aliases, asked, text };
}
