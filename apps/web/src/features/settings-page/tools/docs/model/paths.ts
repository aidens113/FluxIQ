import type { DocumentationPage } from "fluxiq/docs";

export function docRouteKey(page: DocumentationPage): string {
  return normalizeDocPath(String(page?.routePath ?? page?.path ?? page?.id ?? ""));
}

export function normalizeDocPath(value: string): string {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const normalized = withoutQuery
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\.(md|mdx|html|json)$/i, "");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveDocsLink(activePage: DocumentationPage | undefined, href: string): string | null {
  const clean = href.trim();
  if (!clean || clean.startsWith("#") || /^(https?:|mailto:|javascript:)/i.test(clean)) return null;
  if (!activePage) return null;
  const current = docRouteKey(activePage);
  if (clean.startsWith("/")) return normalizeDocPath(clean);
  const currentDir = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
  return normalizeDocPath(currentDir ? `${currentDir}/${clean}` : clean);
}

export function docsLinkCandidates(target: string): string[] {
  const normalized = normalizeDocPath(target);
  const values = new Set<string>([normalized]);
  if (normalized.endsWith("/index")) values.add(normalized.replace(/\/index$/, ""));
  if (normalized.endsWith("/README")) values.add(normalized.replace(/\/README$/, ""));
  if (normalized && !normalized.endsWith("/index") && !normalized.endsWith("/README")) {
    values.add(`${normalized}/index`);
    values.add(`${normalized}/README`);
  }
  if (!normalized) {
    values.add("index");
    values.add("README");
  }
  return [...values];
}
