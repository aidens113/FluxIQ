import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { automationStudioLlmStepLogScreen } from "./screen.ts";

/** One completed step as `index.md` lists it. */
export type AutomationStudioLlmStepLogRow = { step: number; kind: string; tool: string | undefined; summary: string; costUsd: number | undefined };

/** Each directory's rows, read from its completed folders once per process and then kept. */
const rowsByDirectory = new Map<string, Map<number, AutomationStudioLlmStepLogRow>>();

const HEADER = [
  "# Run steps",
  "",
  "One row per completed step folder, in step order. A folder is complete once it holds `meta.json`.",
  "",
  "| Step | Kind | Tool | Summary | Cost |",
  "| --- | --- | --- | --- | --- |"
];

/**
 * Adds a completed step to `index.md` in `directory` and rewrites the file:
 * to a temporary name and renamed over it, so a reader never sees half of one,
 * or written directly where the rename is refused. Best-effort throughout.
 */
export function automationStudioLlmStepLogListStep(directory: string, row: AutomationStudioLlmStepLogRow): void {
  try {
    const rows = rowsOf(directory);
    rows.set(row.step, row);
    const lines = [...rows.values()].sort((a, b) => a.step - b.step).map(line);
    const text = automationStudioLlmStepLogScreen(`${[...HEADER, ...lines].join("\n")}\n`).text;
    const target = path.join(directory, "index.md");
    const temporary = path.join(directory, `.index.md.${process.pid}.${Date.now()}.tmp`);
    try {
      writeFileSync(temporary, text);
      renameSync(temporary, target);
    } catch {
      /* best-effort: the rename was refused, so the index is written in place */
      writeFileSync(target, text);
    }
  } catch {
    /* best-effort: an unwritten index never fails the step */
  }
}

function rowsOf(directory: string): Map<number, AutomationStudioLlmStepLogRow> {
  const known = rowsByDirectory.get(directory);
  if (known) return known;
  const rows = new Map<number, AutomationStudioLlmStepLogRow>();
  for (const entry of readdirSync(directory)) {
    const metaFile = path.join(directory, entry, "meta.json");
    if (!/^\d{4,}-/u.test(entry) || !existsSync(metaFile)) continue;
    const meta = readMeta(metaFile);
    if (meta && typeof meta.step === "number") {
      rows.set(meta.step, {
        step: meta.step,
        kind: typeof meta.kind === "string" ? meta.kind : "-",
        tool: typeof meta.toolId === "string" ? meta.toolId : undefined,
        summary: typeof meta.summary === "string" ? meta.summary : "",
        costUsd: typeof meta.costUsd === "number" ? meta.costUsd : undefined
      });
    }
  }
  rowsByDirectory.set(directory, rows);
  return rows;
}

function readMeta(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch (error) {
    // A meta.json cut short by a killed Core, or removed since it was listed: that step is left out of the index.
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function line(row: AutomationStudioLlmStepLogRow): string {
  const cell = (value: string) => value.replace(/[\r\n]+/gu, " ").replace(/\|/gu, "\\|");
  const cost = row.costUsd === undefined ? "-" : `$${row.costUsd.toFixed(6)}`;
  return `| ${String(row.step).padStart(4, "0")} | ${cell(row.kind)} | ${cell(row.tool ?? "-")} | ${cell(row.summary) || "-"} | ${cost} |`;
}
