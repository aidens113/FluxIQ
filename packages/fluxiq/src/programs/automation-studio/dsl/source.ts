import type { AutomationStudioFlowArtifact } from "../model/index.ts";
import type { AutomationStudioNodeRegistry } from "../../../components/automation/index.ts";
import { parseConstrainedFlowModule as parseExecutableModule, flowSourceDigest } from "../../../flows/executable/dsl/index.ts";
import type { AutomationStudioFlowCompilation, AutomationStudioFlowCompilerDiagnostic, AutomationStudioFlowDefinition } from "./contracts.ts";
import { compileFlowDefinition } from "./compiler.ts";

export function parseConstrainedFlowModule(sourceText: string, moduleId: string): { ok: true; definition: AutomationStudioFlowDefinition; diagnostics: AutomationStudioFlowCompilerDiagnostic[] } | { ok: false; diagnostics: AutomationStudioFlowCompilerDiagnostic[] } {
  return parseExecutableModule<AutomationStudioFlowDefinition>(sourceText, moduleId);
}

export function compileFlowSource(sourceText: string, options: { projectId: string; moduleId: string; now?: number; registry?: AutomationStudioNodeRegistry }): AutomationStudioFlowCompilation {
  const parsed = parseConstrainedFlowModule(sourceText, options.moduleId);
  if (!parsed.ok) return parsed;
  const compiled = compileFlowDefinition(parsed.definition, { projectId: options.projectId, moduleId: options.moduleId, sourceDigest: flowSourceDigest(sourceText), ...(options.now !== undefined ? { now: options.now } : {}), ...(options.registry ? { registry: options.registry } : {}) });
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics.map(item => ({ ...item, location: item.location ?? { moduleId: options.moduleId, line: 3, column: 1 } })) };
  return compiled;
}

export function convertCodeOwnedFlowToVisual(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact { return { ...structuredClone(flow), source: { mode: "visual" }, publication: { status: "draft" }, updatedAt: Date.now() }; }
