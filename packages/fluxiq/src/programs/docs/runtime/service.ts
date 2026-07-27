import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { DocumentationPage, DocumentationSource, DocsSnapshot } from "../types";

export class DocsService {
  private readonly sources = new Map<string, DocumentationSource>();

  registerSource(source: DocumentationSource): this {
    if (this.sources.has(source.id)) {
      throw new Error(`Duplicate docs source: ${source.id}`);
    }
    this.sources.set(source.id, source);
    return this;
  }

  async snapshot(nowMs = Date.now()): Promise<DocsSnapshot> {
    const sources = [...this.sources.values()].sort((left, right) => left.title.localeCompare(right.title));
    const pages = (await Promise.all(sources.map((source) => this.scanSource(source)))).flat();
    return {
      sources,
      pages: pages.sort((left, right) => left.title.localeCompare(right.title)),
      generatedAtMs: nowMs
    };
  }

  private async scanSource(source: DocumentationSource): Promise<DocumentationPage[]> {
    const root = path.resolve(source.rootDir);
    const files = await markdownFiles(root);
    return Promise.all(
      files.map(async (filePath) => {
        const info = await stat(filePath);
        const relative = path.relative(root, filePath);
        return {
          id: `${source.id}:${relative.replaceAll("\\", "/")}`,
          sourceId: source.id,
          title: titleFromPath(relative),
          path: filePath,
          updatedAtMs: info.mtimeMs
        };
      })
    );
  }
}

async function markdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) return markdownFiles(entryPath);
        return entry.isFile() && /\.(md|mdx)$/i.test(entry.name) ? [entryPath] : [];
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

function titleFromPath(value: string): string {
  const name = value.split(/[\\/]/g).pop() ?? value;
  return name
    .replace(/\.(md|mdx)$/i, "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
