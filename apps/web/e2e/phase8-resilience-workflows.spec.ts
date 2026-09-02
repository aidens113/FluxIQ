import { expect, test, type Route } from "@playwright/test";
import { authenticate, openFixtureProject, openStudioView, readUiFixtureManifest, requirePhase8Project, selectFixtureFlow } from "./support/app-fixture";

test("failed project request exposes Retry and recovers without replacing the shell", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  let allowRecovery = false;
  await page.route("**/api/programs/automation-studio/projects*", async (route) => {
    if (!allowRecovery) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Phase 8 retry fixture" }) });
      return;
    }
    await route.continue();
  });
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Phase 8 retry fixture")).toBeVisible();
  allowRecovery = true;
  await page.getByRole("button", { name: /Retry/u }).click();
  await expect(page.getByText(manifest.projects.phase8Empty.name, { exact: true })).toBeVisible();
});

test("stale run-detail responses cannot replace the latest selected run", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const project = requirePhase8Project(manifest, "ordinary");
  const selectedFlowId = project.flowIds?.[0];
  expect(selectedFlowId, "the ordinary fixture must declare its first canonical Flow").toBeTruthy();
  const runPages: Array<{ request: Record<string, unknown>; response: Record<string, any> }> = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/api/programs/automation-studio/list-flow-runs") || response.request().method() !== "POST") return;
    try {
      runPages.push({
        request: response.request().postDataJSON() as Record<string, unknown>,
        response: await response.json() as Record<string, any>,
      });
    } catch { /* failed requests are surfaced by the Runtime Debug error state */ }
  });
  await openFixtureProject(page, project);
  await selectFixtureFlow(page, project);
  await openStudioView(page, "Runtime Debug");
  const runRows = page.locator(".automation-runtime-run-row");
  await expect.poll(() => runPages.find((entry) => entry.request.flowId === selectedFlowId)?.response.payload?.page?.total).toBe(10);
  await expect(runRows).toHaveCount(10);

  const delayedDetails: Route[] = [];
  await page.route("**/api/programs/automation-studio/list-flow-run-actions*", async (route) => {
    let body: Record<string, unknown> | null = null;
    try { body = route.request().postDataJSON() as Record<string, unknown>; } catch { /* non-JSON request */ }
    if (delayedDetails.length === 0) {
      delayedDetails.push(route);
      return;
    }
    await route.continue();
  });
  await runRows.first().click();
  await expect(page.getByText("Action Log", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(runRows).toHaveCount(10);
  await runRows.nth(1).click();
  await expect(page.getByText("Action Log", { exact: true }).first()).toBeVisible();
  if (delayedDetails[0]) {
    await delayedDetails[0].fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, payload: { actions: [{ attemptId: "stale.phase8", nodeId: "stale-node", status: "failed" }] } }) });
    await expect(page.getByText("stale.phase8", { exact: true })).toHaveCount(0);
  }
});

test("mutation controls prevent double submit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The destructive duplicate-submit proof runs once against the owned fixture host.");
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  let createRequests = 0;
  page.on("request", (request) => {
    if (!request.url().includes("/api/programs/automation-studio/create-project") || request.method() !== "POST") return;
    createRequests += 1;
  });
  await page.getByRole("button", { name: "Project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Create project/u });
  await dialog.getByLabel("Project name").fill(`Phase 8 duplicate gate ${Date.now()}`);
  await dialog.getByLabel("Description").fill("Owned browser certification record.");
  const pin = dialog.getByLabel("Security PIN");
  if (await pin.count()) await pin.fill(process.env.FLUXIQ_E2E_SECURITY_PIN ?? manifest.credentials.securityPin);
  const create = dialog.getByRole("button", { name: "Create project" });
  await create.dblclick();
  await expect.poll(() => createRequests).toBe(1);
});

test("Problems filtering is server-backed and pairing dismissal is local until Reject", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  let rejectRequests = 0;
  let pairingPending = true;
  await page.route("**/api/client-gateway/snapshot", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, payload: {
      sessions: [{ sessionId: "session.phase8", clientId: "fixture-client" }],
      pairings: pairingPending
        ? [{ pairingCode: "pair.phase8", referenceCode: "P8-0001", requestedBySessionId: "session.phase8", expiresAt: Date.now() + 60_000 }]
        : [],
    } }),
  }));
  await page.route("**/api/client-gateway/dismiss-pairing", async (route) => {
    rejectRequests += 1;
    pairingPending = false;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await authenticate(page, manifest);
  const pairing = page.getByRole("dialog", { name: "Client pairing request" });
  await expect(pairing).toBeVisible();
  await page.keyboard.press("Escape");
  expect(rejectRequests).toBe(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(pairing).toBeVisible();
  await pairing.getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => rejectRequests).toBe(1);
  await expect(pairing).toHaveCount(0);

  await openFixtureProject(page, requirePhase8Project(manifest, "ordinary"));
  await openStudioView(page, "Problems");
  const search = page.getByPlaceholder("Search problems");
  await search.fill("deterministic");
  await search.press("Enter");
  await page.getByRole("toolbar", { name: "Problem severity" }).getByRole("button", { name: /Errors/u }).click();
  await expect(search).toHaveValue("deterministic");
});
