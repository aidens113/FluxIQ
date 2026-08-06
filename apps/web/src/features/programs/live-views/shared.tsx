"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { BackgroundTaskDefinition } from "fluxiq/background-tasks";
import type { DocumentationPage } from "fluxiq/docs";
import type { ProductionRun } from "fluxiq/production-runner";
import { useProgramApi, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";

export type DocsTreeNode = {
  name: string;
  path: string;
  children: DocsTreeNode[];
  page?: DocumentationPage;
};

export function yesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

export function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}
export function isSensitiveDatabaseStore(kind: string): boolean {
  return kind.trim().toLowerCase() === "identity.users";
}

export function sensitiveStoreKey(kind: string, database: string): string {
  return `${database}:${kind.trim().toLowerCase()}`;
}

export function buildDocumentationTree(pages: DocumentationPage[]): DocsTreeNode {
  const root: DocsTreeNode = { name: "docs", path: "", children: [] };
  for (const page of [...pages].sort((left, right) => docRouteKey(left).localeCompare(docRouteKey(right)))) {
    const route = docRouteKey(page);
    const parts = route.split("/").filter(Boolean);
    const fileName = parts.pop() ?? page.title ?? "index";
    let current = root;
    for (const part of parts) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.children.find((node) => node.path === path && !node.page);
      if (!child) {
        child = { name: titleFromRouteSegment(part), path, children: [] };
        current.children.push(child);
      }
      current = child;
    }
    current.children.push({
      name: titleFromRouteSegment(fileName),
      path: `file:${route}:${page.id}`,
      children: [],
      page
    });
  }
  sortDocsTree(root);
  return root;
}

export function sortDocsTree(node: DocsTreeNode): void {
  node.children.sort((left, right) => {
    if (Boolean(left.page) !== Boolean(right.page)) return left.page ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortDocsTree(child);
}

export function shouldCollapseDocsFolder(node: DocsTreeNode): boolean {
  const path = node.path.toLowerCase();
  const name = node.name.toLowerCase();
  if (!path) return false;
  if (path.startsWith("runtime-docs/reference/typedoc/assets")) return true;
  if (path.startsWith("runtime-docs/reference/typedoc/classes")) return true;
  if (path.startsWith("runtime-docs/reference/typedoc/types")) return true;
  if (["classes", "types", "functions", "variables", "assets"].includes(name) && path.startsWith("runtime-docs/")) return true;
  return node.children.length > 30 && path.startsWith("runtime-docs/");
}

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

export function titleFromRouteSegment(value: string): string {
  if (/^README$/i.test(value.replace(/\.(md|mdx|html|json)$/i, ""))) return "README";
  return value
    .replace(/\.(md|mdx|html|json)$/i, "")
    .replace(/^index$/i, "Index")
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "-";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

export function formatCountdown(task: Pick<BackgroundTaskDefinition, "enabled" | "nextRunAtMs">, nowMs: number, schedulerRunning = true): string {
  if (!task?.enabled) return "Stopped";
  if (!schedulerRunning) return "Paused";
  if (!task.nextRunAtMs) return "Manual";
  const remainingSeconds = Math.max(0, Math.ceil((Number(task.nextRunAtMs) - nowMs) / 1000));
  if (remainingSeconds <= 0) return "Due now";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function scheduleProgress(task: Pick<BackgroundTaskDefinition, "intervalMs" | "lastRunAtMs" | "nextRunAtMs">, nowMs = Date.now()): string {
  if (!task?.intervalMs || !task.nextRunAtMs) return "0%";
  const remaining = Math.max(0, Number(task.nextRunAtMs) - nowMs);
  const elapsedRatio = 1 - remaining / Number(task.intervalMs);
  return `${Math.max(4, Math.min(100, elapsedRatio * 100))}%`;
}

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function copyText(value: string): void {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}

export function emptyCredentialEdit(kind: "password" | "pin") {
  return {
    kind,
    value: "",
    confirm: "",
    authorizationPassword: "",
    authorizationPin: "",
    authorizationTotp: ""
  };
}

export function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

export function sandboxedDocumentationHtml(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"></head><body>${html}</body></html>`;
}

export function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}

export function parseJsonObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as JsonObject } : { ok: false, error: "JSON must be an object" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function flattenRunLogs(runs: ProductionRun[]): Array<{ atMs: number; target: string; loop: string; status: string; message: string; type: string }> {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: String(run.metadata?.message ?? "-"), type: run.targetType ?? "run" }];
    return executions.map((execution) => ({ atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}
