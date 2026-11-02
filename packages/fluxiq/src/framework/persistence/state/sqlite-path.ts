import path from "node:path";
import type { JsonObject } from "../../../core/index.ts";
import { SQLiteRepository } from "../sqlite/index.ts";
import { programStateConnections } from "./connections.ts";
import { programStateRoot } from "./root.ts";

export function sqliteStateForPath(targetPath: string, strict = false): { repository: SQLiteRepository<JsonObject>; id: string; rootDir: string; kind: string } | null {
  const resolved = path.resolve(targetPath);
  const root = programStateRoot(path.dirname(resolved));
  if (!root) return null;
  const current = root.dir;
  const config = root.config as { layoutVersion?: unknown } | null;
  if (config?.layoutVersion !== 2) {
    if (strict && config?.layoutVersion !== 1) throw new Error("program_state.readonly_layout");
    return null;
  }
  const relative = path.relative(current, resolved).replaceAll("\\", "/");
  const programPrefix = "programs/";
  const automationPrefix = "artifacts/automation-studio/";
  if (relative.startsWith(programPrefix)) {
    return {
      repository: new SQLiteRepository({ rootDir: current, kind: "program.state", layoutVersion: 2, connections: programStateConnections.forRoot(current) }),
      id: relative.slice(programPrefix.length).replace(/\.json$/i, ""),
      rootDir: current,
      kind: "program.state",
    };
  }
  if (relative.startsWith(automationPrefix)) {
    return {
      repository: new SQLiteRepository({ rootDir: current, kind: "automation.state", layoutVersion: 2, connections: programStateConnections.forRoot(current) }),
      id: relative.slice(automationPrefix.length).replace(/\.json$/i, ""),
      rootDir: current,
      kind: "automation.state",
    };
  }
  if (strict) throw new Error("program_state.readonly_path");
  return null;
}
