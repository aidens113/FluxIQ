import path from "node:path";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioProjectArtifactKind } from "../../../model/index.ts";

// Every path under a project's storage root. The root is fixed at construction:
// an in-memory service has none, and each helper then resolves to the empty
// string exactly as the monolithic service did.
export class AutomationStudioProjectPaths {
  constructor(readonly root: string | undefined) {}

  projectDirectory(projectId: string): string {
    if (!this.root) return "";
    return path.join(this.root, safeSegment(projectId));
  }

  projectFile(projectId: string, ...parts: string[]): string {
    return path.join(this.projectDirectory(projectId), ...parts);
  }

  projectInstructionFile(projectId: string, instructionId: string): string {
    return this.projectFile(projectId, "instructions", `${safeSegment(instructionId)}.json`);
  }

  projectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): string {
    const folder = this.projectArtifactFolder(kind);
    return this.projectFile(projectId, folder, safeSegment(artifactId), projectArtifactDocumentFileName(folder));
  }

  projectArtifactFolder(kind: AutomationStudioProjectArtifactKind): "tasks" | "routines" | "configs" | "flows" {
    if (kind === "task") return "tasks";
    if (kind === "routine") return "routines";
    if (kind === "config") return "configs";
    return "flows";
  }

  flowRouterIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "routers.json");
  }

  flowSubflowIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "subflows.json");
  }

  flowInstructionIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "instructions.json");
  }

  flowChangeProposalIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "change-proposals.json");
  }

  flowRunIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "runs.json");
  }

  flowAdaptationIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "adaptations.json");
  }

  flowAdaptationPolicyIndexFile(projectId: string): string {
    return this.projectFile(projectId, "indexes", "adaptation-policies.json");
  }
}

export function projectArtifactDocumentFileName(folder: "tasks" | "routines" | "configs" | "flows"): string {
  if (folder === "tasks") return "task.json";
  if (folder === "routines") return "routine.json";
  if (folder === "configs") return "config.json";
  return "flow.json";
}
