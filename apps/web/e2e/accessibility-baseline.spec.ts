import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  authenticate,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";

test("records axe results for the launcher and scale Studio project", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const launcher = await analyzeAxe(page);

  await openFixtureProject(page, manifest.projects.scale);
  const studio = await analyzeAxe(page);

  await writeArtifact(testInfo, "axe-baseline", { launcher, studio });
  expect(launcher.passes).toBeGreaterThan(0);
  expect(studio.passes).toBeGreaterThan(0);
});

test("records keyboard focus order for primary workflows", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.representative);

  const samples = [];
  for (let index = 0; index < 45; index += 1) {
    await page.keyboard.press("Tab");
    samples.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return {
        tag: element?.tagName ?? null,
        text: element?.textContent?.trim().slice(0, 80) ?? "",
        ariaLabel: element?.getAttribute("aria-label"),
        role: element?.getAttribute("role"),
        className: typeof element?.className === "string" ? element.className : "",
      };
    }));
  }

  await writeArtifact(testInfo, "keyboard-focus-baseline", { samples });
  expect(samples.some((sample) => sample.tag && sample.tag !== "BODY")).toBe(true);
});

test("records 200 percent zoom overflow", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.scale);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await page.waitForTimeout(100);

  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const overflow = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          ariaLabel: element.getAttribute("aria-label"),
          text: element.textContent?.trim().slice(0, 60) ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .slice(0, 200);
    return {
      viewportWidth,
      viewportHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      overflow,
    };
  });

  await writeArtifact(testInfo, "zoom-200-baseline", result);
  expect(result.viewportWidth).toBeGreaterThan(0);
});

test("records reduced-motion compliance", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.representative);

  const result = await page.evaluate(() => {
    const reduceRequested = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moving = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          className: element.className,
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          transitionDuration: style.transitionDuration,
        };
      })
      .filter((item) =>
        item.animationName !== "none"
        || item.animationDuration.split(",").some((value) => parseFloat(value) > 0)
        || item.transitionDuration.split(",").some((value) => parseFloat(value) > 0),
      )
      .slice(0, 200);
    return { reduceRequested, moving };
  });

  await writeArtifact(testInfo, "reduced-motion-baseline", result);
  expect(result.reduceRequested).toBe(true);
});

async function analyzeAxe(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  return {
    passes: result.passes.length,
    incomplete: result.incomplete,
    violations: result.violations,
  };
}

async function writeArtifact(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await writeFile(testInfo.outputPath(`${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const operationalPrograms = ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"] as const;

test("gates global programs for blocking axe violations and 200 percent horizontal overflow", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  const results: Record<string, unknown> = {};
  for (const programId of operationalPrograms) {
    await page.goto(`/programs/${programId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    const axe = await analyzeAxe(page);
    expect(blockingViolations(axe.violations), programId + " has blocking accessibility violations").toEqual([]);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(overflow.document, programId + " has page-level horizontal overflow at 200% zoom").toBeLessThanOrEqual(overflow.viewport + 2);
    results[programId] = { axe, overflow };
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  }
  await writeArtifact(testInfo, "global-program-accessibility-zoom", results);
});

function blockingViolations(violations: Array<{ impact?: string | null; id: string }>) {
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => violation.id);
}
