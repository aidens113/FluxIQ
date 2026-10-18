import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readCssManifest } from "../../../features/programs/css-manifest-test-helper";

const routeLayout = new URL("../layout.tsx", import.meta.url);
const routeManifest = new URL("../get-started.css", import.meta.url);
const onboardingView = new URL("../../../features/automation-studio/onboarding/OnboardingView.tsx", import.meta.url);
const frame = new URL("../GetStartedFrame.tsx", import.meta.url);
const domainChoice = new URL("../SetupDomainChoice.tsx", import.meta.url);

function markupClasses(source: URL): string[] {
  const attributes = [...readFileSync(source, "utf8").matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/gu)];
  const tokens = attributes.flatMap((match) => (match[1] ?? match[2] ?? "").replace(/\$\{[^}]*\}/gu, " ").split(/\s+/u));
  return [...new Set(tokens.filter(Boolean))].sort();
}

function classesWithPrefix(source: URL, prefix: string): string[] {
  return markupClasses(source).filter((className) => className.startsWith(prefix));
}

function defines(css: string, className: string): boolean {
  return new RegExp(String.raw`\.${className}(?![\w-])`, "u").test(css);
}

it("loads the route stylesheet through the get-started layout, like the Studio route", () => {
  expect(readFileSync(routeLayout, "utf8")).toContain('import "./get-started.css";');
});
it("keeps the route stylesheet an import-only manifest", () => {
  const lines = readFileSync(routeManifest, "utf8").split(/\r?\n/u).filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(line).toMatch(/^@import "\.\/[^"]+\.css";$/u);
});
it("keeps the onboarding markup off Studio-only selectors, which this route does not load", () => {
  expect(classesWithPrefix(onboardingView, "automation-")).toEqual([]);
});
it("styles every onboarding and setup-page class from the stylesheet this route loads", () => {
  const css = readCssManifest(routeManifest);
  const classes = [
    ...classesWithPrefix(onboardingView, "onboarding"),
    ...classesWithPrefix(frame, "get-started-"),
    ...classesWithPrefix(domainChoice, "get-started-")
  ];
  expect(classes).toContain("onboarding-steps");
  expect(classes).toContain("get-started-body");
  for (const className of classes) expect(defines(css, className), className).toBe(true);
});
