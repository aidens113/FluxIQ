import type { DataStepDeclaration } from "../wire";

/** What the "Add a data step" form holds, in the words its fields show. */
export type DataStepForm =
  | { kind: "keep-where"; field: string; test: "is" | "is-not" | "at-most" | "at-least" | "contains"; value: string }
  | { kind: "sort"; field: string; order: "lowest" | "highest" }
  | { kind: "keep-first"; count: string }
  | { kind: "remove-duplicates"; field: string }
  | { kind: "save-dataset"; name: string }
  | { kind: "export"; format: "csv" | "json"; path: string };

const TESTS = { "is": "eq", "is-not": "ne", "at-most": "lte", "at-least": "gte", "contains": "contains" } as const;

/** A dotted field path ("seller.name"); any other key is sent as a one-part list (["Price (USD)"]). */
const DOTTED = /^[A-Za-z_][\w-]*(\.[\w-]+)*$/u;

/**
 * The data step a form describes, in a data step's own declaration (`@fluxiq/contracts/fluxnode`
 * `DataStep`, without its id and input), or the reason in plain words it cannot be added yet.
 */
export function dataStepFromForm(form: DataStepForm): { ok: true; data: DataStepDeclaration } | { ok: false; reason: string } {
  switch (form.kind) {
    case "keep-where": {
      const field = fieldOf(form.field);
      if (!field) return { ok: false, reason: "Say which field to check." };
      const value = form.value.trim();
      if (!value) return { ok: false, reason: "Say what the field should be compared with." };
      const numeric = Number(value);
      const needsNumber = form.test === "at-most" || form.test === "at-least";
      if (needsNumber && !Number.isFinite(numeric)) return { ok: false, reason: "“At most” and “at least” compare with a number." };
      const literal = form.test !== "contains" && Number.isFinite(numeric) ? numeric : value;
      return { ok: true, data: { kind: "filter", where: { op: TESTS[form.test], args: [{ field }, { value: literal }] } } };
    }
    case "sort": {
      const field = fieldOf(form.field);
      if (!field) return { ok: false, reason: "Say which field to sort by." };
      return { ok: true, data: { kind: "sort", by: [{ field, order: form.order === "lowest" ? "asc" : "desc" }] } };
    }
    case "keep-first": {
      const count = Number(form.count.trim());
      if (!Number.isInteger(count) || count < 1) return { ok: false, reason: "Say how many rows to keep, as a whole number of 1 or more." };
      return { ok: true, data: { kind: "limit", count } };
    }
    case "remove-duplicates": {
      const field = fieldOf(form.field);
      if (!field) return { ok: false, reason: "Say which field makes two rows the same." };
      return { ok: true, data: { kind: "dedupe", key: [field], keep: "first" } };
    }
    case "save-dataset": {
      const name = form.name.trim();
      if (!name) return { ok: false, reason: "Give the dataset a name." };
      return { ok: true, data: { kind: "sink", to: { kind: "dataset", name } } };
    }
    case "export": {
      const path = form.path.trim();
      if (!path || path.startsWith("/") || path.split(/[\\/]/u).includes("..")) return { ok: false, reason: "Give a file name inside the project, such as exports/rows.csv." };
      return { ok: true, data: { kind: "sink", to: { kind: "file", format: form.format, path } } };
    }
  }
}

function fieldOf(text: string): string | string[] | undefined {
  const field = text.trim();
  if (!field) return undefined;
  return DOTTED.test(field) ? field : [field];
}
