import path from "node:path";
import { safeSegment } from "./safe-segment.ts";

export function programDataFile(rootDir: string, programId: string, fileName: string): string {
  return path.join(rootDir, "programs", safeSegment(programId), fileName);
}
