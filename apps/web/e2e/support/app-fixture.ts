import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export type UiFixtureManifest = {
  schemaVersion: 1;
  credentials: { username: string; password: string; securityPin: string };
  fixtureProfiles?: Record<string, Record<string, number>>;
  projects: {
    empty: FixtureProject;
    small: FixtureProject;
    scale1k: FixtureProject;
    scale10k: FixtureProject;
    representative: FixtureProject;
    scale: FixtureProject;
    phase8Empty: FixtureProject;
    phase8Ordinary: FixtureProject | null;
    phase8Scale: FixtureProject | null;
  };
  phase8: {
    contract: { schemaVersion: 1; profiles: Record<"empty" | "ordinary" | "scale", Record<string, number>> };
    selection: "none" | "ordinary" | "scale" | "all";
    materialized: Record<"empty" | "ordinary" | "scale", boolean>;
  };
};

export type FixtureProject = {
  id: string;
  name: string;
  flowIds?: string[];
  recordingIds?: string[];
  recordingLabels?: string[];
  counts?: Record<string, number>;
  storage?: { problems: string; docs: string };
};

export type StudioViewTitle =
  | "Connected Clients"
  | "Timeline"
  | "Nodes"
  | "Router"
  | "Subflows"
  | "Instructions"
  | "Adaptations"
  | "Settings"
  | "State View"
  | "Runtime Debug"
  | "Problems"
  | "Inspector";

export function requirePhase8Project(manifest: UiFixtureManifest, profile: "empty" | "ordinary" | "scale"): FixtureProject {
  const project = profile === "empty"
    ? manifest.projects.phase8Empty
    : profile === "ordinary"
      ? manifest.projects.phase8Ordinary
      : manifest.projects.phase8Scale;
  if (!project) {
    throw new Error(`Phase 8 ${profile} fixture is not materialized. Re-seed with FLUXIQ_E2E_PHASE8_PROFILE=${profile} or all.`);
  }
  return project;
}

const webRoot = path.resolve(import.meta.dirname, "../..");

export async function readUiFixtureManifest(): Promise<UiFixtureManifest> {
  const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
  return JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8")) as UiFixtureManifest;
}

export async function authenticate(page: Page, manifest: UiFixtureManifest): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    timeout: 30_000,
    data: {
      username: process.env.FLUXIQ_E2E_USERNAME ?? manifest.credentials.username,
      password: process.env.FLUXIQ_E2E_PASSWORD ?? manifest.credentials.password,
    },
  });
  expect(response.ok(), `fixture login failed (${response.status()}): ${await response.text()}`).toBe(true);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Programs", exact: true })).toBeVisible();
}

export async function captureState(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

export async function assertResponsiveSurface(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const overflow = Math.max(0, root.scrollWidth - root.clientWidth);
    const clipped: string[] = [];
    const interactive = Array.from(document.querySelectorAll<HTMLElement>(
      'button:not([hidden]), a[href]:not([hidden]), input:not([type="hidden"]):not([hidden]), select:not([hidden]), textarea:not([hidden]), [role="button"]:not([hidden]), [role="tab"]:not([hidden])',
    ));
    for (const element of interactive) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || element.closest('[aria-hidden="true"], [inert]')) continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) continue;
      let ancestor = element.parentElement;
      let scrollReachable = false;
      while (ancestor && ancestor !== document.body) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (/(auto|scroll)/u.test(`${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`)
          && (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth)) {
          scrollReachable = true;
        }
        if (/(hidden|clip)/u.test(`${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`)) {
          const clip = ancestor.getBoundingClientRect();
          if (!scrollReachable && (bounds.right <= clip.left || bounds.left >= clip.right || bounds.bottom <= clip.top || bounds.top >= clip.bottom)) {
            const label = element.getAttribute("aria-label") || element.title || element.textContent?.trim().slice(0, 80) || element.tagName;
            const owner = typeof ancestor.className === "string" && ancestor.className ? `.${ancestor.className.trim().replace(/\s+/gu, ".")}` : ancestor.tagName;
            clipped.push(`${label} [owner=${owner}; control=${Math.round(bounds.left)},${Math.round(bounds.top)},${Math.round(bounds.right)},${Math.round(bounds.bottom)}; clip=${Math.round(clip.left)},${Math.round(clip.top)},${Math.round(clip.right)},${Math.round(clip.bottom)}]`);
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
    }
    return { overflow, clipped: [...new Set(clipped)].slice(0, 20) };
  });
  expect(report.overflow, "document-level horizontal overflow").toBeLessThanOrEqual(1);
  expect(report.clipped, "interactive controls clipped by an overflow owner").toEqual([]);
}

export async function openFixtureProject(page: Page, project: FixtureProject): Promise<void> {
  await page.goto(`/programs/automation-studio?project=${encodeURIComponent(project.id)}`, {
    waitUntil: "domcontentloaded",
  });
  const projectHeading = page.locator(".automation-studio-sidebar-heading").getByText(project.name);
  let narrow = await isStudioNarrowWorkspace(page);
  if (!await projectHeading.isVisible().catch(() => false)) narrow = await ensureStudioProjectHierarchyVisible(page);
  await expect(projectHeading).toBeVisible();
  await expect(studioProjectNavigation(page)).toBeVisible();
  await expect(studioFlowTree(page)).toBeVisible();
  if (narrow) {
    const drawer = page.getByRole("dialog", { name: "Project Hierarchy", exact: true });
    if (await drawer.isVisible().catch(() => false)) {
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      await expect(drawer).toBeHidden();
    }
  }
}

export function studioProjectNavigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Automation Studio project tree" });
}

export function studioProjectHierarchy(page: Page): Locator {
  return page.getByRole("complementary", { name: "Project hierarchy" });
}

export function studioFlowTree(page: Page): Locator {
  return studioProjectNavigation(page).getByRole("tree", { name: "Flows" });
}

export async function selectFixtureFlow(page: Page, project: FixtureProject, flowIndex = 0): Promise<Locator> {
  const flowId = project.flowIds?.[flowIndex];
  if (!flowId) throw new Error(`${project.name} does not declare Flow ${flowIndex} in its fixture manifest.`);
  return selectHierarchyObject(page, `Large Adaptive Flow ${flowIndex}`, "flow");
}

export async function selectFixtureRecording(page: Page, project: FixtureProject, recordingIndex = 0): Promise<Locator> {
  const recordingId = project.recordingIds?.[recordingIndex];
  if (!recordingId) throw new Error(`${project.name} does not declare recording ${recordingIndex} in its fixture manifest.`);
  await selectFixtureFlow(page, project, 0);
  const ownedPrefix = `recording.${project.id}.`;
  const fallbackLabel = recordingId.startsWith(ownedPrefix)
    ? recordingId.slice(ownedPrefix.length)
    : recordingId.replace(/^recording[.:_-]?/u, "");
  const lookupLabel = project.recordingLabels?.[recordingIndex] ?? fallbackLabel;
  return selectHierarchyObject(page, lookupLabel, "recording", Boolean(project.recordingLabels?.[recordingIndex]));
}

export function studioViewRegion(page: Page, title: StudioViewTitle): Locator {
  const region = title === "Problems" || title === "Inspector" ? "inspector" : "main";
  return page.locator(`[data-workspace-region="${region}"]`);
}

export function studioViewTab(page: Page, title: StudioViewTitle): Locator {
  return studioViewRegion(page, title).getByRole("tab", { name: title, exact: true });
}

export async function openStudioView(page: Page, title: StudioViewTitle): Promise<Locator> {
  const region = studioViewRegion(page, title);
  const tab = studioViewTab(page, title);
  const rightRegion = title === "Problems" || title === "Inspector";
  if (rightRegion && await isStudioNarrowWorkspace(page) && !await region.isVisible().catch(() => false)) {
    const inspectorButton = page.locator(".automation-narrow-workspace-actions > button").filter({ hasText: "Inspector" });
    await expect(inspectorButton).toBeVisible();
    await inspectorButton.click();
    await expect(region).toBeVisible();
  }
  if (await tab.count()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    return tab;
  }

  const addTab = region.getByRole("button", { name: /^Add (?:sidebar )?tab$/u }).first();
  await expect(addTab, `${title} must be opened from its ${title === "Problems" || title === "Inspector" ? "inspector" : "main"} region`).toBeVisible();
  await waitForReactOwnership(addTab, `${title} tab adder`);
  await addTab.click();
  const picker = page.locator(".automation-window-adder-panel:visible");
  await expect(picker).toBeVisible();
  const choice = picker.getByRole("button", { name: new RegExp(`^${escapeRegex(title)}(?:\\s|$)`, "u") });
  await expect(choice, `${title} must be available for the current Studio selection`).toBeEnabled();
  await waitForReactOwnership(choice, `${title} tab choice`);
  await choice.click();
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return tab;
}

async function selectHierarchyObject(page: Page, label: string, kind: "flow" | "recording", exactLabel = true): Promise<Locator> {
  const narrow = await ensureStudioProjectHierarchyVisible(page);
  const search = studioProjectHierarchy(page).getByRole("searchbox", { name: "Search project hierarchy" });
  await search.fill(label);
  const labelPattern = new RegExp(`${exactLabel ? "^" : ""}${escapeRegex(label)}$`, "u");
  const item = studioFlowTree(page).getByRole("treeitem", { name: labelPattern });
  await expect(item, `the ${kind} ${label} must be exposed by the project hierarchy`).toHaveCount(1);
  const rowCommand = item.locator(".tree-row-main");
  await waitForReactOwnership(rowCommand, `${kind} ${label} hierarchy command`);
  await rowCommand.click();
  if (narrow) {
    await expect(page.getByRole("dialog", { name: "Project Hierarchy", exact: true })).toBeHidden();
  }
  await expect(studioViewTab(page, kind === "flow" ? "Router" : "Timeline")).toHaveAttribute("aria-selected", "true");
  if (narrow) {
    if (kind === "recording") {
      await ensureStudioProjectHierarchyVisible(page);
      const reopenedSearch = studioProjectHierarchy(page).getByRole("searchbox", { name: "Search project hierarchy" });
      const reopenedItem = studioFlowTree(page).getByRole("treeitem", { name: labelPattern });
      await expect(reopenedItem).toHaveAttribute("aria-selected", "true");
      await reopenedSearch.fill("");
      await page.getByRole("dialog", { name: "Project Hierarchy", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
      await expect(studioViewTab(page, "Timeline")).toHaveAttribute("aria-selected", "true");
    }
  } else {
    if (kind === "recording") await expect(item).toHaveAttribute("aria-selected", "true");
    await search.fill("");
  }
  return item;
}

export async function ensureStudioProjectHierarchyVisible(page: Page): Promise<boolean> {
  const hierarchy = studioProjectHierarchy(page);
  const hierarchyButton = page.locator(".automation-narrow-workspace-actions > button").filter({ hasText: "Hierarchy" });
  const narrow = await isStudioNarrowWorkspace(page);
  await expect.poll(async () => (
    await hierarchy.isVisible().catch(() => false)
    || await hierarchyButton.isVisible().catch(() => false)
  ), { message: "Studio must expose its desktop hierarchy or responsive Hierarchy control" }).toBe(true);
  if (await hierarchy.isVisible().catch(() => false)) return narrow;
  await expect(hierarchyButton).toBeVisible();
  await expect(page.locator('[data-workspace-region="main"] [role="tabpanel"]:visible').first()).toBeVisible();
  await waitForReactOwnership(hierarchyButton, "responsive Hierarchy control");
  await hierarchyButton.click();
  await expect(page.getByRole("dialog", { name: "Project Hierarchy", exact: true })).toBeVisible();
  await expect(hierarchy).toBeVisible();
  return true;
}

async function isStudioNarrowWorkspace(page: Page): Promise<boolean> {
  return page.locator('.automation-studio-shell[data-narrow="true"]').isVisible().catch(() => false);
}

export async function waitForReactOwnership(locator: Locator, label: string): Promise<void> {
  await expect.poll(() => locator.evaluate((element) => (
    Object.keys(element).some((key) => key.startsWith("__reactProps$"))
  )), { message: `React must own the ${label} before interaction` }).toBe(true);
}

export async function installPhase8CorpusRoutes(page: Page, project: FixtureProject): Promise<{ problems: number; docs: number }> {
  if (!project.storage) throw new Error(`Phase 8 corpus storage is missing for ${project.name}.`);
  const [problemRecords, docRecords] = await Promise.all([
    readNdjson<Record<string, unknown>>(project.storage.problems),
    readNdjson<{ id: string; path: string; title: string; body: string }>(project.storage.docs),
  ]);
  const docsById = new Map(docRecords.map((record) => [record.id, record]));
  await page.route("**/api/programs/automation-studio/list-project-problems*", async (route) => {
    let payload: Record<string, unknown> = {};
    try { payload = route.request().postDataJSON() as Record<string, unknown>; } catch { /* empty payload */ }
    const severity = typeof payload.severity === "string" ? payload.severity : "";
    const search = typeof payload.search === "string" ? payload.search.toLowerCase() : "";
    const filtered = problemRecords.filter((problem) => (!severity || problem.severity === severity)
      && (!search || JSON.stringify(problem).toLowerCase().includes(search)));
    const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 100)));
    const offset = Math.max(0, Number(payload.offset ?? 0));
    const problems = filtered.slice(offset, offset + limit);
    const counts = {
      error: filtered.filter((problem) => problem.severity === "error").length,
      warning: filtered.filter((problem) => problem.severity === "warning").length,
      info: filtered.filter((problem) => problem.severity === "info").length,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true,
      payload: { problems, page: { problems, total: filtered.length, counts, limit, offset, hasMore: offset + limit < filtered.length } },
    }) });
  });
  await page.route("**/api/programs/docs/snapshot*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, payload: {
      sources: [{ id: "phase8", title: "Phase 8 corpus", rootDir: "storage-seeded", scope: "program" }],
      pages: docRecords.map((record) => ({ id: record.id, sourceId: "phase8", title: record.title, path: record.path, routePath: `/phase8/${record.id}`, updatedAtMs: 1_768_478_400_000 })),
      generatedAtMs: 1_768_478_400_000, warnings: [], generatedPages: docRecords.length,
    } }),
  }));
  await page.route("**/api/programs/docs/get-page*", async (route) => {
    let pageId = "";
    try { pageId = String((route.request().postDataJSON() as { pageId?: string }).pageId ?? ""); } catch { /* invalid request */ }
    const record = docsById.get(pageId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, payload: record ? {
      id: record.id, sourceId: "phase8", title: record.title, path: record.path, routePath: `/phase8/${record.id}`,
      updatedAtMs: 1_768_478_400_000, format: "markdown", markdown: record.body,
      html: `<h1>${escapeHtml(record.title)}</h1><p>Deterministic Phase 8 corpus content.</p>`,
    } : null }) });
  });
  return { problems: problemRecords.length, docs: docRecords.length };
}

async function readNdjson<T>(target: string): Promise<T[]> {
  const source = await readFile(target, "utf8");
  return source.split(/\r?\n/gu).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
