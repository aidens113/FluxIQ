import { AutomationStudioNodeRegistry } from "../canonical-registry.ts";
import type { AutomationStudioImporterSdkManifest } from "./manifest.ts";
import { validateAutomationStudioImporterSdkManifest } from "./validation.ts";
/** Explicit manifest registry. FluxIQ never scans or imports host modules from display metadata. */
export class AutomationStudioImporterSdkRegistry {
  private readonly manifests = new Map<string, AutomationStudioImporterSdkManifest>();
  readonly nodes = new AutomationStudioNodeRegistry();
  register(manifest: AutomationStudioImporterSdkManifest): this {
    const issues = validateAutomationStudioImporterSdkManifest(manifest);
    if (issues.length)
      throw new Error(`Invalid Automation Studio importer SDK manifest: ${issues.join(", ")}`);
    const existing = this.manifests.get(manifest.packageId);
    if (existing && existing.domainId !== manifest.domainId)
      throw new Error(`Importer package ${manifest.packageId} cannot change domains.`);
    if (existing)
      throw new Error(`Importer package ${manifest.packageId} is already registered; create a new host runtime to activate version ${manifest.packageVersion}.`);
    for (const node of manifest.nodes)
      this.nodes.register(node);
    this.manifests.set(manifest.packageId, structuredClone(manifest));
    return this;
  }
  get(packageId: string): AutomationStudioImporterSdkManifest | undefined {
    const value = this.manifests.get(packageId);
    return value ? structuredClone(value) : undefined;
  }
  list(): AutomationStudioImporterSdkManifest[] {
    return [...this.manifests.values()].map((value) => structuredClone(value));
  }
}
