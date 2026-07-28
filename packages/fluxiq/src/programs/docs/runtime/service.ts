import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import type { DocumentationPage, DocumentationPageContent, DocumentationSource, DocsSnapshot } from "../types";

type DocsState = {
  sources: DocumentationSource[];
  pages: DocumentationPage[];
  generatedAtMs: number;
  warnings: string[];
};

export class DocsService {
  private readonly sources = new Map<string, DocumentationSource>();
  private readonly store?: ProgramJsonStore<DocsState>;
  private loaded = false;
  private cache: DocsState = { sources: [], pages: [], generatedAtMs: 0, warnings: [] };

  constructor(options: { dataDir?: string } = {}) {
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "docs", "cache.json"), () => ({ sources: [], pages: [], generatedAtMs: 0, warnings: [] }));
    }
  }

  registerSource(source: DocumentationSource): this {
    if (this.sources.has(source.id)) {
      throw new Error(`Duplicate docs source: ${source.id}`);
    }
    this.sources.set(source.id, source);
    return this;
  }

  async upsertSource(source: DocumentationSource): Promise<DocumentationSource> {
    await this.load();
    this.sources.set(source.id, source);
    await this.rebuild();
    return source;
  }

  async snapshot(nowMs = Date.now()): Promise<DocsSnapshot> {
    await this.load();
    if (!this.cache.generatedAtMs) {
      return this.rebuild(nowMs);
    }
    return this.cache;
  }

  async rebuild(nowMs = Date.now()): Promise<DocsSnapshot> {
    await this.load();
    const sources = [...this.sources.values()].sort((left, right) => left.title.localeCompare(right.title));
    const warnings: string[] = [];
    const pages = (await Promise.all(sources.map((source) => this.scanSource(source, warnings)))).flat();
    this.cache = {
      sources,
      pages: pages.sort((left, right) => left.title.localeCompare(right.title)),
      generatedAtMs: nowMs,
      warnings
    };
    await this.persist();
    return this.cache;
  }

  async getPage(pageId: string): Promise<DocumentationPageContent | null> {
    await this.load();
    const snapshot = await this.snapshot();
    const page = snapshot.pages.find((item) => item.id === pageId);
    if (!page) return null;
    const markdown = await readFile(page.path, "utf8");
    return {
      ...page,
      markdown,
      html: renderMarkdown(markdown)
    };
  }

  private async scanSource(source: DocumentationSource, warnings: string[]): Promise<DocumentationPage[]> {
    const root = path.resolve(source.rootDir);
    const files = await markdownFiles(root, warnings);
    return Promise.all(
      files.map(async (filePath) => {
        const info = await stat(filePath);
        const relative = path.relative(root, filePath).replaceAll("\\", "/");
        return {
          id: `${source.id}:${relative}`,
          sourceId: source.id,
          title: titleFromPath(relative),
          path: filePath,
          routePath: `/${relative.replace(/\.(md|mdx)$/i, "")}`,
          updatedAtMs: info.mtimeMs
        };
      })
    );
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store) return;
    const state = await this.store.read();
    for (const source of state.sources) {
      if (!this.sources.has(source.id)) this.sources.set(source.id, source);
    }
    this.cache = {
      sources: state.sources,
      pages: state.pages,
      generatedAtMs: state.generatedAtMs,
      warnings: state.warnings ?? []
    };
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write(this.cache);
  }
}

async function markdownFiles(root: string, warnings: string[]): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") return [];
        if (entry.isDirectory()) return markdownFiles(entryPath, warnings);
        return entry.isFile() && /\.(md|mdx)$/i.test(entry.name) ? [entryPath] : [];
      })
    );
    return nested.flat();
  } catch (error) {
    warnings.push(`Unable to scan docs root ${root}: ${error instanceof Error ? error.message : String(error)}`);
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

function renderMarkdown(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (!line.trim()) return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
