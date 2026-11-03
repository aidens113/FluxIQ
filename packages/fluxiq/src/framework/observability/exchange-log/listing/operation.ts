import type { AutomationStudioLlmStepLogRow } from "./row.ts";
import path from "node:path";
import { automationStudioLlmStepLogScreen } from "../screen.ts";
import { NativeExchangeLogInvocation } from "../native/index.ts";

/** Each directory's rows, read from its completed folders once per process and then kept. */
const rowsByDirectory = new Map<string, Map<number, AutomationStudioLlmStepLogRow>>();

const PREAMBLE = [
  "# Run steps",
  "",
  "One row per completed step folder, in step order. A folder is complete once it holds `meta.json`."
];

function header(agents: boolean): string[] {
  return agents
    ? ["", "| Step | Kind | Role | Brief | Tool | Summary | Cost |", "| --- | --- | --- | --- | --- | --- | --- |"]
    : ["", "| Step | Kind | Tool | Summary | Cost |", "| --- | --- | --- | --- | --- |"];
}

/** The original single-cache index algorithm, with current native facts before its catches. */
export function listNativeExchangeLogStep(directory: string, row: AutomationStudioLlmStepLogRow, invocation?: NativeExchangeLogInvocation): void {
  if (invocation !== undefined) NativeExchangeLogInvocation.assert(invocation);
  try {
    const rows = rowsOf(directory, invocation);
    rows.set(row.step, row);
    const sorted = [...rows.values()].sort((a, b) => a.step - b.step);
    const agents = sorted.some((listed) => listed.role !== undefined);
    const lines = sorted.map((listed) => line(listed, agents));
    const text = automationStudioLlmStepLogScreen(`${[...PREAMBLE, ...header(agents), ...lines].join("\n")}\n`).text;
    const target = path.join(directory, "index.md");
    const temporary = path.join(directory, `.index.md.${process.pid}.${NativeExchangeLogInvocation.now(invocation)}.tmp`);
    try {
      NativeExchangeLogInvocation.write(invocation, temporary, text);
      NativeExchangeLogInvocation.rename(invocation, temporary, target);
    } catch (error) {
      NativeExchangeLogInvocation.failed(invocation, error);
      /* best-effort: the rename was refused, so the index is written in place */
      NativeExchangeLogInvocation.write(invocation, target, text);
    }
  } catch (error) {
    NativeExchangeLogInvocation.failed(invocation, error);
    /* best-effort: an unwritten index never fails the step */
  }
}

function rowsOf(directory: string, invocation: NativeExchangeLogInvocation | undefined): Map<number, AutomationStudioLlmStepLogRow> {
  const known = rowsByDirectory.get(directory);
  if (known) return known;
  const rows = new Map<number, AutomationStudioLlmStepLogRow>();
  for (const entry of NativeExchangeLogInvocation.readdir(invocation, directory)) {
    const metaFile = path.join(directory, entry, "meta.json");
    if (!/^\d{4,}-/u.test(entry) || !NativeExchangeLogInvocation.exists(invocation, metaFile)) continue;
    const meta = readMeta(metaFile, invocation);
    if (meta && typeof meta.step === "number") {
      rows.set(meta.step, {
        step: meta.step,
        kind: typeof meta.kind === "string" ? meta.kind : "-",
        tool: typeof meta.toolId === "string" ? meta.toolId : undefined,
        summary: typeof meta.summary === "string" ? meta.summary : "",
        costUsd: typeof meta.costUsd === "number" ? meta.costUsd : undefined,
        role: typeof meta.role === "string" ? meta.role : undefined,
        briefId: typeof meta.briefId === "string" ? meta.briefId : undefined
      });
    }
  }
  rowsByDirectory.set(directory, rows);
  return rows;
}

function readMeta(file: string, invocation: NativeExchangeLogInvocation | undefined): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(NativeExchangeLogInvocation.read(invocation, file)) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch (error) {
    NativeExchangeLogInvocation.failed(invocation, error);
    // A meta.json cut short by a killed Core, or removed since it was listed: that step is left out of the index.
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function line(row: AutomationStudioLlmStepLogRow, agents: boolean): string {
  const cell = (value: string) => value.replace(/[\r\n]+/gu, " ").replace(/\|/gu, "\\|");
  const cost = row.costUsd === undefined ? "-" : `$${row.costUsd.toFixed(6)}`;
  const agent = agents ? ` ${cell(row.role ?? "-")} | ${cell(row.briefId ?? "-")} |` : "";
  return `| ${String(row.step).padStart(4, "0")} | ${cell(row.kind)} |${agent} ${cell(row.tool ?? "-")} | ${cell(row.summary) || "-"} | ${cost} |`;
}
