// The record-processing readers re-exported for browser code (t728, lane S):
// the extension content script and the domain judge a `where`, read a number,
// dedupe and sort with Core's own functions through the browser-safe
// `fluxiq/automation-studio/nodes` subpath, never through a copy and never
// through the `fluxiq/automation-studio` barrel, which pulls in `node:crypto`.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as contracts from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import * as nodes from "../index.ts";
import * as recordProcess from "../record-process.ts";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const processDir = path.resolve(testsDir, "..", "..", "..", "..", "..", "..", "contracts", "src", "record-sets", "process");

const VALUES = [
  "AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS",
  "AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES",
  "AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES",
  "AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS",
  "AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS",
  "AUTOMATION_STUDIO_RECORD_SORT_ORDERS",
  "AUTOMATION_STUDIO_RECORD_SORT_TYPES",
  "AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES",
  "automationStudioRecordAutoSortKind",
  "automationStudioRecordConditionComparesDates",
  "automationStudioRecordConditionHolds",
  "automationStudioRecordConditionPattern",
  "automationStudioRecordRowIdentity",
  "countAutomationStudioRecordUnsortableRows",
  "readAutomationStudioRecordConditionDateBound",
  "readAutomationStudioRecordConditionWithin",
  "readAutomationStudioRecordDate",
  "readAutomationStudioRecordNumber",
  "readAutomationStudioRecordSortValue",
  "sortAutomationStudioRecordRows"
] as const;

describe("the browser-safe record-process re-exports", () => {
  it("are Core's own values, by name, from the nodes barrel", () => {
    expect(Object.keys(recordProcess).sort()).toEqual([...VALUES].sort());
    for (const name of VALUES) {
      expect(contracts[name], name).toBeDefined();
      expect(nodes[name], name).toBe(contracts[name]);
      expect(recordProcess[name], name).toBe(contracts[name]);
    }
  });

  it("judge a field-less condition and read a magnitude as Core does", () => {
    expect(nodes.automationStudioRecordConditionHolds({ atLeast: 70_000 }, "£72k – £80k per annum")).toBe(true);
    expect(nodes.automationStudioRecordConditionHolds({}, "")).toBe(false);
    expect(nodes.readAutomationStudioRecordNumber("$1.2m")).toBe(1_200_000);
  });

  it("import only the contracts subpath, which the processing reaches through relative imports alone", async () => {
    const offenders: string[] = [];
    const check = (file: string, source: string, allowed: (specifier: string) => boolean) => {
      for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+([^;]*?)\bfrom\s*["']([^"']+)["']/g)) {
        const clause = match[1] ?? "";
        const specifier = match[2] ?? "";
        if (/^type\b/u.test(clause)) continue;
        if (specifier.startsWith("node:") || !allowed(specifier)) offenders.push(`${path.basename(file)}:${specifier}`);
      }
    };
    const entry = path.resolve(testsDir, "..", "record-process.ts");
    check(entry, await readFile(entry, "utf8"), (specifier) => specifier === "@fluxiq/contracts/automation-studio");
    for (const name of await readdir(processDir)) {
      if (!name.endsWith(".ts")) continue;
      const file = path.join(processDir, name);
      check(file, await readFile(file, "utf8"), (specifier) => specifier.startsWith("./") || specifier.startsWith("../"));
    }
    expect(offenders).toEqual([]);
  });
});
