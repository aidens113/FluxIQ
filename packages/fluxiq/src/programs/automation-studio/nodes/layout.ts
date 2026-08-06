import { automationNodeClasses } from "./registry.ts";

export const automationStudioSourceNodeRoot = "packages/fluxiq/src/programs/automation-studio/nodes";
export const automationStudioBuiltinNodeRoots = automationNodeClasses
  .filter((nodeClass) => nodeClass !== "custom" && nodeClass !== "runtime")
  .map((nodeClass) => `${automationStudioSourceNodeRoot}/${nodeClass}`);
export const automationStudioCustomNodeRoot = ".fluxiq/data/programs/automation-studio/nodes/custom";

export const automationStudioCustomNodeFolders = automationNodeClasses.map((nodeClass) => `${automationStudioCustomNodeRoot}/${nodeClass}`);

export const automationStudioProjectCustomNodeRoot = ".fluxiq/data/programs/automation-studio/projects/{projectId}/custom-nodes";
