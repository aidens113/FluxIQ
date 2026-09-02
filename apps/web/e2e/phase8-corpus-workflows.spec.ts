import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { authenticate, installPhase8CorpusRoutes, openFixtureProject, openStudioView, readUiFixtureManifest, requirePhase8Project } from "./support/app-fixture";

test("Scale Problems and Docs corpora are consumed by their routed production views", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The 200,000-record routed corpus proof runs once in normalized Chromium.");
  test.setTimeout(5 * 60_000);
  const manifest = await readUiFixtureManifest();
  const project = requirePhase8Project(manifest, "scale");
  const installed = await installPhase8CorpusRoutes(page, project);
  expect(installed).toEqual({ problems: 100_000, docs: 100_000 });
  await authenticate(page, manifest);
  await openFixtureProject(page, project);

  await openStudioView(page, "Problems");
  await expect(page.locator('[aria-label="100000 problems"]')).toBeVisible();
  expect(await page.locator(".automation-problem-row").count(), "Problems must remain paged").toBeLessThanOrEqual(100);

  await page.goto("/programs/docs", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("100000 indexed pages", { exact: true })).toBeVisible();
  await expect(page.locator(".docs-rendered")).toBeVisible();
  const mountedDocRows = await page.getByRole("treeitem").count();
  expect(mountedDocRows, "Docs navigation must remain virtualized").toBeLessThan(100);
  await writeFile(testInfo.outputPath("phase8-routed-corpus.json"), `${JSON.stringify({ ...installed, mountedDocRows }, null, 2)}\n`, "utf8");
});
