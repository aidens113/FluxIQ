import path from "node:path";
import { ProgramJsonStore, safeSegment } from "../../../_shared/storage.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";

/** Reads the actual catalogue/manifest without legacy migration or empty fallback. */
export class CanonicalAuthorityProjectExistence {
  constructor(private readonly projectRootDir: string) { if (!path.isAbsolute(projectRootDir)) throw new Error("canonical_authority.root"); }
  async verify(projectId: string): Promise<string> {
    V.id(projectId);
    if (projectId !== safeSegment(projectId) || projectId === "." || projectId === "..") throw new Error("canonical_authority.project_id");
    const paths = [path.join(this.projectRootDir, "index.json"), path.join(this.projectRootDir, projectId, "manifest.json")];
    const first = await ProgramJsonStore.readExistingReadOnlyMany(paths);
    const second = await ProgramJsonStore.readExistingReadOnlyMany(paths);
    if (V.digest(first) !== V.digest(second)) throw new Error("canonical_authority.project_changed");
    const [index, manifest] = second;
    if (!index || !Array.isArray(index.projects) || !manifest || manifest.id !== projectId) throw new Error("canonical_authority.project_missing");
    const matches = index.projects.filter(item => item && typeof item === "object" && !Array.isArray(item) && item.id === projectId);
    if (matches.length !== 1) throw new Error("canonical_authority.project_missing");
    return V.digest({ projectId, index: matches[0], manifest });
  }
}
