import { createHash } from "node:crypto";
import type { AutomationStudioFlowArtifact } from "../model/index.ts";
import type { AutomationStudioFlowCompilation, AutomationStudioFlowCompilerDiagnostic, AutomationStudioFlowDefinition } from "./contracts.ts";
import { compileFlowDefinition } from "./compiler.ts";
import type { AutomationStudioNodeRegistry } from "../nodes/index.ts";

const importLine = 'import { defineFlow } from "fluxiq/automation-studio/dsl";';

/** Parses only the generated declarative module shape; it never evaluates JavaScript. */
export function compileFlowSource(sourceText: string, options: { projectId: string; moduleId: string; now?: number; registry?: AutomationStudioNodeRegistry }): AutomationStudioFlowCompilation {
  const parsed = parseConstrainedFlowModule(sourceText, options.moduleId);
  if (!parsed.ok) return parsed;
  const sourceDigest = `sha256:${createHash("sha256").update(sourceText.replace(/\r\n/g, "\n")).digest("hex")}`;
  const compiled = compileFlowDefinition(parsed.definition, { projectId: options.projectId, moduleId: options.moduleId, sourceDigest, ...(options.now !== undefined ? { now: options.now } : {}), ...(options.registry ? { registry: options.registry } : {}) });
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics.map((item) => ({ ...item, location: item.location ?? { moduleId: options.moduleId, line: 3, column: 1 } })) };
  return compiled;
}

export function parseConstrainedFlowModule(sourceText: string, moduleId: string): { ok: true; definition: AutomationStudioFlowDefinition; diagnostics: AutomationStudioFlowCompilerDiagnostic[] } | { ok: false; diagnostics: AutomationStudioFlowCompilerDiagnostic[] } {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  const prefix = `${importLine}\n\nexport default defineFlow(`; const suffix = ");";
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) return { ok: false, diagnostics: [{ severity: "error", code: "flow.source_unsupported_module_shape", message: "Code-owned Flow modules may only import defineFlow and export one JSON-compatible defineFlow call.", location: { moduleId, line: 1, column: 1 }, remediation: "Generate the module from a visual Flow or use the exact constrained module template." }] };
  const json = normalized.slice(prefix.length, -suffix.length);
  try { const value = JSON.parse(json) as AutomationStudioFlowDefinition; return { ok: true, definition: value, diagnostics: [] }; }
  catch (error) { const match = /position (\d+)/.exec(error instanceof Error ? error.message : ""); const offset = match ? Number(match[1]) : 0; const before = json.slice(0, offset); return { ok: false, diagnostics: [{ severity: "error", code: "flow.source_invalid_json", message: error instanceof Error ? error.message : "Invalid declarative Flow source.", location: { moduleId, line: 3 + before.split("\n").length - 1, column: (before.split("\n").at(-1)?.length ?? 0) + 1 }, remediation: "Use JSON-compatible values only; functions, environment access, and executable expressions are not permitted." }] }; }
}

export function convertCodeOwnedFlowToVisual(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact { return { ...structuredClone(flow), source: { mode: "visual" }, publication: { status: "draft" }, updatedAt: Date.now() }; }
