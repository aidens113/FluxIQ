import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo } from "@playwright/test";

export type AccessibilityInventory = {
  title: string;
  landmarks: Record<string, number>;
  headings: Array<{ level: number; text: string }>;
  controls: Array<{ role: string; name: string; disabled: boolean }>;
  criticalViolations: Array<{
    id: string;
    impact: string | null;
    nodes: number;
    targets: string[][];
    summaries: string[];
  }>;
};

export async function certifyAccessibilitySurface(page: Page, testInfo: TestInfo, name: string): Promise<AccessibilityInventory> {
  const axe = await new AxeBuilder({ page }).analyze();
  const criticalViolations = axe.violations
    .filter((violation) => violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      nodes: violation.nodes.length,
      targets: violation.nodes.map((node) => node.target.map(String)),
      summaries: violation.nodes.map((node) => node.failureSummary ?? ""),
    }));
  const semantics = await page.evaluate(() => {
    const roleCount = (role: string) => document.querySelectorAll(`[role="${role}"], ${role}`).length;
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0
        && !element.closest('[aria-hidden="true"], [inert]');
    };
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=combobox]",
    )).filter(visible).map((element) => ({
      role: element.getAttribute("role") || element.tagName.toLowerCase(),
      name: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim().slice(0, 120) || "",
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
    }));
    return {
      title: document.title,
      landmarks: Object.fromEntries(["main", "navigation", "complementary", "dialog", "tree", "tablist"].map((role) => [role, roleCount(role)])),
      headings: Array.from(document.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")).filter(visible).map((heading) => ({
        level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim().slice(0, 160) || "",
      })),
      controls,
    };
  });
  const inventory = { ...semantics, criticalViolations };
  await writeFile(testInfo.outputPath(`${name}-accessibility.json`), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  expect(criticalViolations, `${name} critical axe violations`).toEqual([]);
  expect(inventory.landmarks.main, `${name} must expose a main landmark`).toBeGreaterThan(0);
  return inventory;
}
