import { expect, test } from "@playwright/test";
import { authenticate, ensureStudioProjectHierarchyVisible, openFixtureProject, readUiFixtureManifest, requirePhase8Project, selectFixtureFlow, studioFlowTree, studioProjectHierarchy, studioProjectNavigation } from "./support/app-fixture";

test("hierarchy supports roving focus, nested disclosure, and deterministic collapse recovery", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  const project = requirePhase8Project(manifest, "ordinary");
  await authenticate(page, manifest);
  await openFixtureProject(page, project);
  await ensureStudioProjectHierarchyVisible(page);

  const tree = studioFlowTree(page);
  await expect(tree).toBeVisible();
  const rows = tree.getByRole("treeitem");
  await expect(rows.first()).toBeVisible();
  await expect.poll(() => rows.count(), {
    message: "Ordinary hierarchy rows must finish loading before keyboard traversal",
  }).toBeGreaterThan(1);
  await rows.first().focus();
  await expect(rows.first()).toBeFocused();

  await page.keyboard.press("ArrowDown");
  const nextFocusedRow = tree.locator('[role="treeitem"]:focus');
  await expect(nextFocusedRow).toHaveCount(1);
  await expect(nextFocusedRow).toBeFocused();
  await expect(rows.first()).not.toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rows.first()).toBeFocused();

  const target = tree.locator('[role="treeitem"][data-tree-item-id="root-flow"]');
  expect(await target.count(), "Ordinary hierarchy fixture must expose an expandable tree item").toBeGreaterThan(0);
  await target.focus();
  await expect(target).toHaveAttribute("aria-expanded", "true");
  const beforeCollapse = await rows.count();
  await target.press("ArrowLeft");
  await expect(target).toHaveAttribute("aria-expanded", "false");
  expect(await rows.count()).toBeLessThanOrEqual(beforeCollapse);
  await target.press("ArrowRight");
  await expect(target).toHaveAttribute("aria-expanded", "true");
  await target.press("ArrowRight");
  await expect(target).not.toBeFocused();
});

test("hierarchy disclosure buttons preserve selection and focus ownership", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const project = requirePhase8Project(manifest, "ordinary");
  await openFixtureProject(page, project);
  await selectFixtureFlow(page, project);
  await ensureStudioProjectHierarchyVisible(page);
  const navigation = studioProjectNavigation(page);
  const search = studioProjectHierarchy(page).getByRole("searchbox", { name: "Search project hierarchy" });
  const tree = studioFlowTree(page);
  await search.fill("Router");
  const selectedBefore = tree.locator('[aria-selected="true"]');
  await expect(selectedBefore).toHaveCount(1);
  const selectedLabel = await selectedBefore.getAttribute("aria-label");
  expect(selectedLabel).toBeTruthy();
  await search.fill("");
  const disclosure = navigation.getByRole("button", { name: /^(?:Collapse|Expand) Flows$/u });
  expect(await disclosure.count(), "Ordinary hierarchy fixture must expose a disclosure control").toBeGreaterThan(0);
  await disclosure.focus();
  await disclosure.click();
  await expect(disclosure).toBeFocused();
  await disclosure.click();
  await expect(disclosure).toBeFocused();
  await search.fill("Router");
  const selectedAfter = tree.locator('[aria-selected="true"]');
  await expect(selectedAfter).toHaveCount(1);
  await expect(selectedAfter).toHaveAttribute("aria-label", selectedLabel!);
});
