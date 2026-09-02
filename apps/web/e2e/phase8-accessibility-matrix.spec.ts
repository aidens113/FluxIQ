import { expect, test } from "@playwright/test";
import { assertResponsiveSurface, authenticate, captureState, openFixtureProject, openStudioView, readUiFixtureManifest, requirePhase8Project, selectFixtureFlow, selectFixtureRecording, studioViewRegion, type StudioViewTitle } from "./support/app-fixture";
import { certifyAccessibilitySurface } from "./support/accessibility";

const programs = [
  ["automation-studio", "Automation Studio"],
  ["background-tasks", "Background Tasks"],
  ["compute-control", "Compute Control"],
  ["database-manager", "Database Manager"],
  ["deployment-sync", "Deployment Sync"],
  ["docs", "Documentation"],
  ["identity-access", "Identity & Access"],
  ["production-runner", "Production Runner"],
  ["secret-keys", "Secret Keys"],
] as const;

const studioViews = [
  "Connected Clients", "Timeline", "Nodes", "Router", "Subflows", "Instructions",
  "Adaptations", "Settings", "State View", "Runtime Debug", "Problems", "Inspector",
] as const satisfies readonly StudioViewTitle[];

test("certifies accessibility and visual inventory for all nine global programs", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  for (const [programId, title] of programs) {
    await page.goto(`/programs/${programId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await assertResponsiveSurface(page);
    await certifyAccessibilitySurface(page, testInfo, `phase8-program-${programId}`);
    await captureState(page, testInfo, `phase8-program-${programId}-${testInfo.project.name}`);
    testInfo.annotations.push({ type: "phase8-program", description: title });
  }
});

test("certifies accessibility and visual inventory for all twelve canonical Studio views", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const project = requirePhase8Project(manifest, "ordinary");
  await openFixtureProject(page, project);
  for (const title of studioViews) {
    if (title === "Timeline") await selectFixtureRecording(page, project);
    else if (!["Connected Clients", "Problems", "Inspector"].includes(title)) await selectFixtureFlow(page, project);
    await openStudioView(page, title);
    await expect(studioViewRegion(page, title).getByRole("tabpanel")).toBeVisible();
    await assertResponsiveSurface(page);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
    await certifyAccessibilitySurface(page, testInfo, `phase8-studio-${slug}`);
    await captureState(page, testInfo, `phase8-studio-${slug}-${testInfo.project.name}`);
  }
});

test("selects the canonical recording through the accessible project hierarchy", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const project = requirePhase8Project(manifest, "ordinary");
  await openFixtureProject(page, project);
  await selectFixtureRecording(page, project);
  await expect(studioViewRegion(page, "Timeline").getByRole("tab", { name: "Timeline", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(studioViewRegion(page, "Timeline").getByRole("tabpanel")).toBeVisible();
  await certifyAccessibilitySurface(page, testInfo, "phase8-studio-canonical-recording");
});
