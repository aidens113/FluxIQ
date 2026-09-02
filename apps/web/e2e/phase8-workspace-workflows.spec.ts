import { expect, test } from "@playwright/test";
import { authenticate, ensureStudioProjectHierarchyVisible, openFixtureProject, openStudioView, readUiFixtureManifest, requirePhase8Project, selectFixtureFlow, studioProjectNavigation, waitForReactOwnership } from "./support/app-fixture";

test("tabs, menus, modals, drawers, comboboxes, resize, and focus return work as one workflow", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, requirePhase8Project(manifest, "ordinary"));

  const addTab = page.getByRole("button", { name: "Add tab" }).first();
  await waitForReactOwnership(addTab, "main tab adder");
  await addTab.click();
  const tabPicker = page.locator(".automation-window-adder-panel");
  await expect(tabPicker).toBeVisible();
  await tabPicker.getByRole("searchbox").fill("connected");
  await tabPicker.getByRole("button", { name: /^Connected Clients/u }).click();
  const mainEditor = page.getByRole("region", { name: "Main editor" });
  const clientsTab = mainEditor.getByRole("tab", { name: /Connected Clients/u });
  await expect(clientsTab).toHaveAttribute("aria-selected", "true");
  const firstTab = mainEditor.getByRole("tab").first();
  await firstTab.click();
  await clientsTab.click();
  await expect(clientsTab).toBeFocused();

  const narrow = await ensureStudioProjectHierarchyVisible(page);
  const actionMenuTrigger = studioProjectNavigation(page).getByRole("button", { name: / actions$/u }).first();
  await waitForReactOwnership(actionMenuTrigger, "hierarchy action menu");
  await actionMenuTrigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actionMenuTrigger).toBeFocused();
  if (narrow) {
    await page.getByRole("dialog", { name: "Project Hierarchy", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  }

  await page.getByRole("button", { name: "Back to Projects" }).click();
  const createProject = page.getByRole("button", { name: "Project", exact: true });
  await createProject.click();
  await expect(page.getByRole("dialog", { name: /Create project/u })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Create project/u })).toHaveCount(0);

  await openFixtureProject(page, requirePhase8Project(manifest, "ordinary"));
  const separator = page.getByRole("separator", { name: "Resize hierarchy" });
  if (await separator.count()) {
    const before = await separator.getAttribute("aria-valuenow");
    await separator.focus();
    await separator.press("ArrowRight");
    expect(await separator.getAttribute("aria-valuenow")).not.toBe(before);
  }

  await page.getByRole("link", { name: "Global workspace" }).click();
  await page.getByRole("link", { name: "Database Manager" }).click();
  const details = page.getByRole("button", { name: "Technical details" });
  await details.click();
  const drawer = page.getByRole("dialog", { name: "Technical details", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveClass(/\bdrawer-panel\b/u);
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  const combobox = page.getByRole("combobox").first();
  await expect(combobox, "Database Manager must expose its Sort/Direction combobox workflow").toBeVisible();
  await combobox.focus();
  await combobox.press("ArrowDown");
  await expect(combobox).toBeFocused();
});

test("dirty tab close requires an explicit save, discard, or cancel decision", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const project = requirePhase8Project(manifest, "ordinary");
  await openFixtureProject(page, project);
  await selectFixtureFlow(page, project);
  await openStudioView(page, "Instructions");
  await page.getByRole("button", { name: "New Instruction", exact: true }).click();
  const editable = page.locator("textarea").first();
  await expect(editable).toBeVisible();
  await editable.fill(`${await editable.inputValue()}\nPhase 8 unsaved draft`);
  const closeActiveTab = page.getByRole("group", { name: "Editor pane" }).getByRole("button", { name: "Close active tab" });
  await closeActiveTab.click();
  const guard = page.getByRole("dialog", { name: "Unsaved changes" });
  await expect(guard).toContainText(/unsaved|discard|save/u);
  await guard.getByRole("button", { name: "Save", exact: true }).click();
  const authorization = page.getByRole("dialog", { name: "Authorize Instruction Save" });
  await expect(authorization).toBeVisible();
  await expect(editable).toBeVisible();
  await authorization.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editable).toBeVisible();
  await closeActiveTab.click();
  await guard.getByRole("button", { name: /Cancel/u }).click();
  await expect(editable).toBeVisible();
  await closeActiveTab.click();
  await page.getByRole("dialog").getByRole("button", { name: /Discard/u }).click();
  await expect(editable).toHaveCount(0);
});
