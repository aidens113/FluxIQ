import { automationStudioEvidenceKey, automationStudioExecutableTargetKey, automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../harness/index.ts";
import { automationStudioSecretNamedKey } from "../../loop-limits/index.ts";

/** Safe authored path identities; no declaration means no parameter-path authority. */
export function automationStudioRerunScreenedPaths(paths: readonly (readonly string[])[], deniedKeys: readonly string[] | undefined): string[][] {
  if (deniedKeys === undefined) return [];
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  return paths.filter((path) => {
    if (!path.length || path.some((key) => !key || denied.has(automationStudioEvidenceKey(key)) || automationStudioExecutableTargetKey(key) || automationStudioSecretNamedKey(key) || automationStudioLocatorShapedText(key))) return false;
    const displayed = path.join(".");
    if (denied.has(automationStudioEvidenceKey(displayed)) || automationStudioLocatorShapedText(displayed)) return false;
    return !screenAutomationStudioLlmEvidence(path, deniedKeys).secretShaped;
  }).map((path) => [...path]);
}
