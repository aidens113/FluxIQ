import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PipelineError } from "../errors.ts";
import type { PipelineFileWriter } from "../types.ts";

/**
 * A file writer confined to `directory`: a relative path that resolves outside it
 * (through `..`, an absolute path or a drive) is refused, and folders are made as needed.
 */
export function createDirectoryFileWriter(directory: string): PipelineFileWriter {
  const root = path.resolve(directory);
  return async (relativePath, content) => {
    const target = path.resolve(root, relativePath);
    const inside = path.relative(root, target);
    if (relativePath === "" || path.isAbsolute(relativePath) || inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new PipelineError("pipeline.file_outside_directory", `"${relativePath}" is not inside the export directory.`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  };
}
