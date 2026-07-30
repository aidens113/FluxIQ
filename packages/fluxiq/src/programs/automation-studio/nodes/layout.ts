import { automationNodeClasses } from "./registry";

export const automationStudioSourceNodeRoot = "packages/fluxiq/src/programs/automation-studio/nodes";
export const automationStudioBuiltinNodeRoot = `${automationStudioSourceNodeRoot}/builtins`;
export const automationStudioCustomNodeRoot = ".fluxiq/data/programs/automation-studio/nodes/custom";

export const automationStudioCustomNodeFolders = automationNodeClasses.map((nodeClass) => `${automationStudioCustomNodeRoot}/${nodeClass}`);

export const automationStudioProjectCustomNodeRoot = ".fluxiq/data/programs/automation-studio/projects/{projectId}/custom-nodes";
