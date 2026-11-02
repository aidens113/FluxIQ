import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as runtime from "../runtime.ts";
import * as studio from "../automation-studio.ts";

describe("neutral runtime contracts", () => {
  it("preserves the Studio API as identical aliases and assignable records", () => {
    expect(runtime.parseRuntimeFailureRecord).toBe(studio.parseAutomationStudioFailureRecord);
    expect(runtime.parseRuntimeTargetActionabilityRecord).toBe(studio.parseAutomationStudioTargetActionabilityRecord);
    expect(runtime.projectRuntimeFailureControlRecord).toBe(studio.projectAutomationStudioFailureControlRecord);
    expect(runtime.RUNTIME_ADAPTIVE_FAILURE_CLASSES).toBe(studio.AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES);
    expect(runtime.RUNTIME_FAILURE_STAGES).toBe(studio.AUTOMATION_STUDIO_FAILURE_STAGES);
    expect(runtime.RUNTIME_FAILURE_EFFECTS).toBe(studio.AUTOMATION_STUDIO_FAILURE_EFFECTS);
    expect(runtime.RUNTIME_FAILURE_RECORD_LIMITS).toBe(studio.AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS);
    expect(runtime.RUNTIME_REPEATED_ANSWER_REASON).toBe(studio.AUTOMATION_STUDIO_REPEATED_ANSWER_REASON);
    expect(runtime.isRuntimeAdaptiveFailureClass).toBe(studio.isAutomationStudioAdaptiveFailureClass);
    expectTypeOf<runtime.RuntimeFailureRecord>().toEqualTypeOf<studio.AutomationStudioFailureRecord>();
    expectTypeOf<runtime.RuntimeTargetActionabilityRecord>().toEqualTypeOf<studio.AutomationStudioTargetActionabilityRecord>();
  });

  it("accepts unchanged wire fields and rejects extra fields or contradictory failures", () => {
    const failure: runtime.RuntimeFailureRecord = {
      category: "target_not_found", code: "device.target_missing", retryable: true,
      stage: "target_resolution", effect: "unacted", certainNoEffect: true
    };
    expect(runtime.parseRuntimeFailureRecord(failure)).toEqual(failure);
    expect(runtime.parseRuntimeFailureRecord({ ...failure, authority: true })).toBeNull();
    expect(runtime.parseRuntimeFailureRecord({ ...failure, stage: "execution" })).toBeNull();
    expect(runtime.parseRuntimeTargetActionabilityRecord({ actionable: false, cause: "disabled" }))
      .toEqual({ actionable: false, cause: "disabled" });
    expect(runtime.parseRuntimeTargetActionabilityRecord({ actionable: true, cause: "disabled" })).toBeUndefined();
  });

  it("refuses actionability accessors without invoking them", () => {
    let reads = 0;
    const value = {
      get actionable() {
        reads++;
        return true;
      }
    };
    expect(runtime.parseRuntimeTargetActionabilityRecord(value)).toBeUndefined();
    expect(reads).toBe(0);
  });

  it("compiles to an independently importable boundary with no host or Studio dependencies", () => {
    const directory = mkdtempSync(join(tmpdir(), "fluxiq-runtime-contracts-"));
    const compiled = new Map<string, string>();
    function compile(source: URL): string {
      const key = source.href;
      const existing = compiled.get(key);
      if (existing) return existing;
      const output = join(directory, `module-${compiled.size}.mjs`);
      compiled.set(key, output);
      const input = readFileSync(source, "utf8");
      const result = ts.transpileModule(input, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
      });
      const javascript = result.outputText.replace(/(from\s+|import\s*)(["'])([^"']+)\2/gu, (_match, prefix: string, quote: string, specifier: string) => {
        expect(specifier.startsWith(".")).toBe(true);
        expect(specifier).not.toContain("automation-studio");
        const dependency = compile(new URL(specifier.replace(/\.js$/u, ".ts"), source));
        return `${prefix}${quote}${pathToFileURL(dependency).href}${quote}`;
      });
      writeFileSync(output, javascript);
      return output;
    }
    try {
      const entry = compile(new URL("../runtime.ts", import.meta.url));
      const records = compile(new URL("../records.ts", import.meta.url));
      const capture = compile(new URL("../recording-capture.ts", import.meta.url));
      const probe = `import { parseRuntimeFailureRecord, parseRuntimeTargetActionabilityRecord } from ${JSON.stringify(pathToFileURL(entry).href)}; if (!parseRuntimeFailureRecord({category:"timeout",code:"device.timeout",retryable:true}) || !parseRuntimeTargetActionabilityRecord({actionable:true})) throw new Error("Contract import failed");`;
      expect(execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8" })).toBe("");
      const recordProbe = `import { parseAutomationStudioRecordsPath } from ${JSON.stringify(pathToFileURL(records).href)}; import { clampAutomationStudioRecordingCaptureSettings } from ${JSON.stringify(pathToFileURL(capture).href)}; if (typeof parseAutomationStudioRecordsPath !== "function" || typeof clampAutomationStudioRecordingCaptureSettings !== "function") throw new Error("Neutral data contract import failed");`;
      expect(execFileSync(process.execPath, ["--input-type=module", "-e", recordProbe], { encoding: "utf8" })).toBe("");
      const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
      expect(manifest.exports["./runtime"]).toEqual({ types: "./dist/runtime.d.ts", import: "./dist/runtime.js" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
