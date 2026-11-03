import { createHash } from "node:crypto";
import type { FlowCompilation, FlowCompilerDiagnostic, FlowCompilerOptions, FlowDefinition } from "./contracts.ts";
import { compileFlowDefinition } from "./compiler.ts";

/** Parses an exact declarative JSON envelope, never evaluating JavaScript or loading its named module. */
export function parseConstrainedFlowModule<TDefinition extends FlowDefinition = FlowDefinition>(sourceText: string, moduleId: string): { ok: true; definition: TDefinition; diagnostics: FlowCompilerDiagnostic[] } | { ok: false; diagnostics: FlowCompilerDiagnostic[] } {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  const prefixes = ["fluxiq/flows/executable/dsl", "fluxiq/automation-studio/dsl"].map(moduleImport => 'import { defineFlow } from "' + moduleImport + '";\n\nexport default defineFlow(');
  const prefix = prefixes.find(value => normalized.startsWith(value));
  const suffix = ");";
  if (!prefix || !normalized.endsWith(suffix)) return { ok: false, diagnostics: [{ severity: "error", code: "flow.source_unsupported_module_shape", message: "Code-owned Flow modules may only import defineFlow and export one JSON-compatible defineFlow call.", location: { moduleId, line: 1, column: 1 }, remediation: "Generate the module from a visual Flow or use the exact constrained module template." }] };
  const json = normalized.slice(prefix.length, -suffix.length);
  try {
    const value = JSON.parse(json) as TDefinition;
    return { ok: true, definition: value, diagnostics: [] };
  } catch (error) {
    const match = /position (\d+)/.exec(error instanceof Error ? error.message : "");
    const offset = match ? Number(match[1]) : 0;
    const before = json.slice(0, offset);
    return { ok: false, diagnostics: [{ severity: "error", code: "flow.source_invalid_json", message: error instanceof Error ? error.message : "Invalid declarative Flow source.", location: { moduleId, line: 3 + before.split("\n").length - 1, column: (before.split("\n").at(-1)?.length ?? 0) + 1 }, remediation: "Use JSON-compatible values only; functions, environment access, and executable expressions are not permitted." }] };
  }
}

export function flowSourceDigest(sourceText: string): string {
  return 'sha256:' + createHash("sha256").update(sourceText.replace(/\r\n/g, "\n")).digest("hex");
}

export function compileFlowSource(sourceText: string, options: FlowCompilerOptions & { moduleId: string }): FlowCompilation {
  const parsed = parseConstrainedFlowModule(sourceText, options.moduleId);
  if (!parsed.ok) return parsed;
  const compiled = compileFlowDefinition(parsed.definition, options);
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics.map(item => ({ ...item, location: item.location ?? { moduleId: options.moduleId, line: 3, column: 1 } })) };
  return compiled;
}
