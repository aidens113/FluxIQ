import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage.ts";
import type { DocumentationGenerator, DocumentationPage, DocumentationPageContent, DocumentationSource, DocsSnapshot, GeneratedDocumentationPage } from "../types.ts";

type DocsState = {
  sources: DocumentationSource[];
  pages: DocumentationPage[];
  generatedAtMs: number;
  warnings: string[];
  generatedPages: number;
};

export class DocsService {
  private readonly sources = new Map<string, DocumentationSource>();
  private readonly generators = new Map<string, DocumentationGenerator>();
  private readonly store?: ProgramJsonStore<DocsState>;
  private readonly docsRootDir: string | undefined;
  private readonly generatedRootDir: string | undefined;
  private readonly allowedSourceRootDirs: string[];
  private loaded = false;
  private cache: DocsState = { sources: [], pages: [], generatedAtMs: 0, warnings: [], generatedPages: 0 };

  constructor(options: { dataDir?: string; docsRootDir?: string; generatedRootDir?: string; allowedSourceRootDirs?: string[] } = {}) {
    this.docsRootDir = options.docsRootDir ? path.resolve(options.docsRootDir) : undefined;
    this.generatedRootDir = options.generatedRootDir ? path.resolve(options.generatedRootDir) : this.docsRootDir ? path.join(this.docsRootDir, "generated") : undefined;
    this.allowedSourceRootDirs = (options.allowedSourceRootDirs ?? (this.docsRootDir ? [this.docsRootDir] : [])).map((root) => path.resolve(root));
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "docs", "cache.json"), () => ({ sources: [], pages: [], generatedAtMs: 0, warnings: [], generatedPages: 0 }));
    }
  }

  registerSource(source: DocumentationSource): this {
    if (this.sources.has(source.id)) {
      throw new Error(`Duplicate docs source: ${source.id}`);
    }
    this.assertSourceAllowed(source);
    this.sources.set(source.id, source);
    return this;
  }

  registerGenerator(generator: DocumentationGenerator): this {
    if (this.generators.has(generator.id)) {
      throw new Error(`Duplicate docs generator: ${generator.id}`);
    }
    this.generators.set(generator.id, generator);
    return this;
  }

  async upsertSource(source: DocumentationSource): Promise<DocumentationSource> {
    await this.load();
    this.assertSourceAllowed(source);
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
    const generatedPages = await this.writeGeneratedDocs(nowMs, warnings);
    const pages = (await Promise.all(sources.map((source) => this.scanSource(source, warnings)))).flat();
    this.cache = {
      sources,
      pages: pages.sort((left, right) => left.title.localeCompare(right.title)),
      generatedAtMs: nowMs,
      warnings,
      generatedPages
    };
    await this.persist();
    return this.cache;
  }

  async getPage(pageId: string): Promise<DocumentationPageContent | null> {
    await this.load();
    const snapshot = await this.snapshot();
    const page = snapshot.pages.find((item) => item.id === pageId);
    if (!page) return null;
    const source = snapshot.sources.find((item) => item.id === page.sourceId);
    if (!source) return null;
    const canonicalPagePath = await this.assertPageAllowed(source, page.path);
    const content = await readFile(canonicalPagePath, "utf8");
    const format = documentationFormat(canonicalPagePath);
    return {
      ...page,
      format,
      markdown: format === "markdown" ? content : "",
      html: renderDocumentationContent(content, format)
    };
  }

  private async scanSource(source: DocumentationSource, warnings: string[]): Promise<DocumentationPage[]> {
    const root = path.resolve(source.rootDir);
    try {
      await this.assertCanonicalSourceAllowed(root);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
    const files = await documentationFiles(root, warnings);
    return Promise.all(
      files.map(async (filePath) => {
        const info = await stat(filePath);
        const relative = path.relative(root, filePath).replaceAll("\\", "/");
        return {
          id: `${source.id}:${relative}`,
          sourceId: source.id,
          title: titleFromPath(relative),
          path: filePath,
          routePath: `/${relative.replace(/\.(md|mdx|html|json)$/i, "")}`,
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
      warnings: state.warnings ?? [],
      generatedPages: state.generatedPages ?? 0
    };
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write(this.cache);
  }

  private async writeGeneratedDocs(nowMs: number, warnings: string[]): Promise<number> {
    if (!this.docsRootDir || !this.generatedRootDir || this.generators.size === 0) return 0;
    await mkdir(this.generatedRootDir, { recursive: true });
    let count = 0;
    for (const generator of this.generators.values()) {
      try {
        const pages = await generator.generate({
          nowMs,
          docsRootDir: this.docsRootDir,
          generatedRootDir: this.generatedRootDir
        });
        for (const page of pages) {
          await this.writeGeneratedPage(page);
          count += 1;
        }
      } catch (error) {
        warnings.push(`Docs generator ${generator.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return count;
  }

  private async writeGeneratedPage(page: GeneratedDocumentationPage): Promise<void> {
    if (!this.generatedRootDir) return;
    const relative = safeRelativeMarkdownPath(page.relativePath);
    const target = path.resolve(this.generatedRootDir, relative);
    if (!target.startsWith(this.generatedRootDir)) {
      throw new Error(`Generated docs path escapes generated root: ${page.relativePath}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, page.markdown.endsWith("\n") ? page.markdown : `${page.markdown}\n`, "utf8");
  }

  private assertSourceAllowed(source: DocumentationSource): void {
    if (!this.allowedSourceRootDirs.length) return;
    const root = path.resolve(source.rootDir);
    if (!this.allowedSourceRootDirs.some((allowedRoot) => isPathInside(allowedRoot, root))) {
      throw new Error(`Documentation source must be inside an allowed docs root: ${root}`);
    }
  }

  private async assertCanonicalSourceAllowed(root: string): Promise<void> {
    if (!this.allowedSourceRootDirs.length) return;
    const canonicalRoot = await realpath(root);
    const canonicalAllowedRoots = await Promise.all(this.allowedSourceRootDirs.map(async (allowedRoot) => realpath(allowedRoot).catch(() => allowedRoot)));
    if (!canonicalAllowedRoots.some((allowedRoot) => isPathInside(allowedRoot, canonicalRoot))) {
      throw new Error(`Documentation source resolves outside an allowed docs root: ${root}`);
    }
  }

  private async assertPageAllowed(source: DocumentationSource, pagePath: string): Promise<string> {
    this.assertSourceAllowed(source);
    const canonicalSourceRoot = await realpath(path.resolve(source.rootDir));
    const canonicalPagePath = await realpath(path.resolve(pagePath));
    await this.assertCanonicalSourceAllowed(canonicalSourceRoot);
    if (!isPathInside(canonicalSourceRoot, canonicalPagePath)) {
      throw new Error(`Documentation page resolves outside its source root: ${pagePath}`);
    }
    return canonicalPagePath;
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function documentationFiles(root: string, warnings: string[]): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next" || entry.name === ".fluxiq") return [];
        if (entry.isDirectory()) return documentationFiles(entryPath, warnings);
        return entry.isFile() && /\.(md|mdx|html|json)$/i.test(entry.name) ? [entryPath] : [];
      })
    );
    return nested.flat();
  } catch (error) {
    warnings.push(`Unable to scan docs root ${root}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function safeRelativeMarkdownPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  const withExtension = /\.(md|mdx)$/i.test(normalized) ? normalized : `${normalized}.md`;
  const clean = withExtension
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-zA-Z0-9_.-]+/g, "-"))
    .join("/");
  return clean || "index.md";
}

function titleFromPath(value: string): string {
  const name = value.split(/[\\/]/g).pop() ?? value;
  return name
    .replace(/\.(md|mdx|html|json)$/i, "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

type DocumentationFormat = DocumentationPageContent["format"];

function documentationFormat(filePath: string): DocumentationFormat {
  if (/\.mdx?$/i.test(filePath)) return "markdown";
  if (/\.html?$/i.test(filePath)) return "html";
  if (/\.json$/i.test(filePath)) return "json";
  return "text";
}

function renderDocumentationContent(content: string, format: DocumentationFormat): string {
  if (format === "markdown") return renderMarkdown(content);
  if (format === "json") return `<pre><code class="language-json">${escapeHtml(prettyJson(content))}</code></pre>`;
  if (format === "html") return renderHtmlDocument(content);
  return `<pre><code>${escapeHtml(content)}</code></pre>`;
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function renderHtmlDocument(value: string): string {
  const title = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const body = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? value;
  const cleaned = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/gi, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<(iframe|object|embed|form|input|textarea|select|option|link|meta)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|form|input|textarea|select|option|link|meta)\b[^>]*\/?\s*>/gi, "")
    .replace(/<details\b([^>]*)>/gi, "<section$1>")
    .replace(/<\/details>/gi, "</section>")
    .replace(/<summary\b[^>]*>/gi, "<div class=\"docs-html-summary\">")
    .replace(/<\/summary>/gi, "</div>")
    .replace(/\sopen(?=[\s>])/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:(['"])[\s\S]*?\1|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(?:(['"])\s*(?:javascript|data):[\s\S]*?\2|(?:javascript|data):[^\s>]+)/gi, "");
  return [
    title ? `<h1>${escapeHtml(title)}</h1>` : "",
    `<div class="docs-html-document">${cleaned}</div>`
  ].join("\n");
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const fence = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const language = fence[1] ? ` class="language-${escapeAttribute(fence[1])}"` : "";
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading?.[1] && heading[2]) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInline((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInline((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (trimmed.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("> ")) {
        quote.push((lines[index] ?? "").trim().slice(2));
        index += 1;
      }
      html.push(`<blockquote>${quote.map((item) => `<p>${renderInline(item)}</p>`).join("")}</blockquote>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() && !startsBlock(lines, index)) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }
  return html.join("\n");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function renderInline(value: string): string {
  const codeSpans: string[] = [];
  const tokenized = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `\u0000${codeSpans.length}\u0000`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  let html = escapeHtml(tokenized);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = safeLinkHref(href);
    return safeHref ? `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  for (const [index, code] of codeSpans.entries()) {
    html = html.replaceAll(`\u0000${index}\u0000`, code);
  }
  return html;
}

function isTableStart(lines: string[], index: number): boolean {
  return isTableLine(lines[index] ?? "") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "");
}

function isTableLine(line: string): boolean {
  return line.trim().includes("|") && line.trim().length > 0;
}

function renderTable(lines: string[]): string {
  const [headerLine, , ...bodyLines] = lines;
  const headers = splitTableRow(headerLine ?? "");
  const rows = bodyLines.map(splitTableRow).filter((row) => row.length > 0);
  return [
    "<table>",
    `<thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${headers.map((_header, index) => `<td>${renderInline(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>"
  ].join("");
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/g).map((cell) => cell.replaceAll("\\|", "|").trim());
}

function startsBlock(lines: string[], index: number): boolean {
  const trimmed = (lines[index] ?? "").trim();
  return /^#{1,4}\s+/.test(trimmed)
    || /^```/.test(trimmed)
    || /^[-*]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || trimmed.startsWith("> ")
    || isTableStart(lines, index);
}

function safeLinkHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[./#][^<>"']*$/.test(trimmed)) return trimmed;
  return null;
}
