import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { assertResponsiveSurface } from "./support/app-fixture";

const webRoot = path.resolve(import.meta.dirname, "..");
const importPattern = /@import\s+(?:url\(\s*)?(?:(["'])((?:.(?!\1))*.?)\1|([^)'"\s]+))\s*\)?[^;]*;/gu;

function inlineCss(file: string, stack: string[] = []): string {
  const resolved = path.resolve(file);
  if (stack.includes(resolved)) throw new Error(`Circular CSS import: ${[...stack, resolved].join(" -> ")}`);
  const source = readFileSync(resolved, "utf8");
  return source.replace(importPattern, (statement, _quote: string | undefined, quoted: string | undefined, unquoted: string | undefined) => {
    const specifier = quoted ?? unquoted;
    if (!specifier?.startsWith(".")) return statement;
    return inlineCss(path.resolve(path.dirname(resolved), specifier), [...stack, resolved]);
  });
}

const fixtureCss = [
  inlineCss(path.join(webRoot, "src/app/globals.css")),
  inlineCss(path.join(webRoot, "src/app/programs/automation-studio/automation-studio.css")),
].join("\n");

const states = ["default", "loading", "empty", "error", "populated", "menu", "modal", "collapsed"] as const;

for (const state of states) {
  test(`captures deterministic ${state} visual baseline`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-chromium"), "Phase 7 committed goldens are normalized in Chromium; Phase 8 routed visuals cover all engines.");
    await page.setContent(fixtureDocument(state));
    await assertResponsiveSurface(page);
    await expect(page).toHaveScreenshot(`phase7-${state}.png`, {
      animations: "disabled",
      caret: "hide",
      fullPage: false,
    });
  });
}

function fixtureDocument(state: typeof states[number]): string {
  const content = stateContent(state);
  const menu = state === "menu" ? `<div class="menu-popover" role="menu" style="position:fixed;right:16px;top:56px;max-height:calc(100dvh - 72px)"><button role="menuitem">Rename Flow</button><button role="menuitem">Duplicate Flow</button><button class="danger" role="menuitem">Delete Flow</button></div>` : "";
  const modal = state === "modal" ? `<div class="modal-backdrop"><section aria-label="Create Flow" aria-modal="true" class="modal-panel" role="dialog"><div class="panel-heading"><div><h2 class="panel-title">Create Flow</h2><p class="panel-kicker">Add a top-level automation.</p></div><button aria-label="Close" class="icon-button">X</button></div><fieldset class="modal-operation-boundary"><label class="field"><span class="field-label">Flow name</span><input value="Customer onboarding and account verification" /></label><label class="field"><span class="field-label">Description</span><textarea>Coordinates the complete onboarding workflow.</textarea></label><div class="modal-actions"><button class="button">Cancel</button><button class="button button-primary">Create Flow</button></div></fieldset></section></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta content="width=device-width, initial-scale=1" name="viewport"><style>${fixtureCss}</style><style>body{overflow:hidden}.fixture-page{height:100dvh}.fixture-brand{font-weight:700}.fixture-icon{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid currentColor;border-radius:3px;font-size:10px}.fixture-view{display:grid;align-content:start;gap:12px;padding:12px}.fixture-table-name{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style></head><body><div class="fixture-page program-fullscreen-shell"><header class="program-global-topbar"><span class="fixture-brand">FluxIQ</span><nav class="program-tabs"><button class="program-tab selected">Automation Studio</button></nav><button class="button">Technical details</button></header><main class="automation-studio-shell${state === "collapsed" ? " sidebar-collapsed" : ""}" data-narrow="true"><aside class="automation-studio-sidebar"><div class="automation-studio-sidebar-heading"><strong title="Customer Operations Workspace">${state === "collapsed" ? "CO" : "Customer Operations Workspace"}</strong><button aria-label="${state === "collapsed" ? "Expand" : "Collapse"} hierarchy" class="icon-button">${state === "collapsed" ? ">" : "<"}</button></div><label class="automation-tree-search"><span class="fixture-icon">S</span><input aria-label="Search project" placeholder="Search project" /></label><div class="automation-project-tree" role="tree"><div class="automation-tree-item"><span class="tree-row-disclosure-slot"><button aria-label="Collapse Customer lifecycle" class="tree-row-disclosure">v</button></span><button class="tree-row-main selected" title="Customer lifecycle and identity verification" role="treeitem"><span class="fixture-icon">F</span><span class="tree-row-label"><strong>Customer lifecycle and identity verification</strong><small>Flow</small></span></button><button aria-label="Customer lifecycle actions" class="icon-button">...</button></div><div class="automation-tree-item" style="padding-inline-start:14px"><span class="tree-row-disclosure-slot"></span><button class="tree-row-main" title="Runtime Debug" role="treeitem"><span class="fixture-icon">R</span><span class="tree-row-label"><strong>Runtime Debug</strong><small>Object</small></span></button></div></div></aside><section class="automation-studio-main"><div class="automation-studio-workspace"><section class="automation-workspace-section main"><div class="automation-workspace-section-header"><div class="automation-workspace-section-actions"><button class="icon-button" aria-label="Arrange Main">A</button><button class="icon-button" aria-label="Add tab">+</button></div></div><div class="automation-dock-layout"><section class="automation-view-container active"><header><div><span class="fixture-icon">I</span><span><strong title="Runtime Debug">Runtime Debug</strong><small>Window 1 - Flow runtime</small></span></div><div class="automation-pane-actions"><button aria-label="Add tab" class="icon-button">+</button><button aria-label="Close active tab" class="icon-button">X</button></div></header><div class="automation-tabs-shell"><button class="automation-tab-scroll" aria-label="Scroll tabs left">&lt;</button><div class="automation-window-tabs" role="tablist"><div class="automation-tab-item selected"><button class="automation-tab-select" role="tab" title="Runtime Debug"><span class="fixture-icon">R</span><span>Runtime Debug</span></button></div><div class="automation-tab-item"><button class="automation-tab-select" role="tab" title="Instructions and scoped runtime guidance"><span class="fixture-icon">I</span><span>Instructions and scoped runtime guidance</span></button></div></div><button class="automation-tab-scroll" aria-label="Scroll tabs right">&gt;</button></div><div class="automation-view-body"><div class="automation-mounted-view-stack"><div class="automation-mounted-view fixture-view" data-active="true">${content}</div></div></div></section></div></section></div></section></main>${menu}${modal}</div></body></html>`;
}

function stateContent(state: typeof states[number]): string {
  if (state === "loading") return `<div class="loading-state" role="status"><span><strong>Loading runs</strong><small>Reading compact run summaries.</small></span></div>`;
  if (state === "empty") return `<div class="empty-state"><strong>No runs yet</strong><p>Run this Flow to inspect ordered actions and node state.</p><div class="empty-state-action"><button class="button button-primary">Run Flow</button></div></div>`;
  if (state === "error") return `<div class="inline-notice error" role="alert"><span><strong>Runs unavailable</strong><small>The run list could not be loaded. Your current selection was kept.</small></span><button class="button">Retry</button></div>`;
  return `<div class="panel-heading"><div><h2 class="panel-title">Previous runs</h2><p class="panel-kicker">Newest first</p></div><div class="inline-actions"><select aria-label="Status"><option>All statuses</option></select><button class="button button-primary">Run</button></div></div><div class="table-wrap"><table aria-label="Previous runs" class="data-table"><thead><tr><th>Status</th><th>Flow</th><th>Started</th><th>Duration</th></tr></thead><tbody><tr><td><span class="status-badge-pill tone-success"><span>Completed</span></span></td><td><div class="fixture-table-name" title="Customer lifecycle and identity verification">Customer lifecycle and identity verification</div></td><td>10:42:18</td><td>1.8 s</td></tr><tr><td><span class="status-badge-pill tone-warning"><span>Running</span></span></td><td>Account review</td><td>10:41:52</td><td>26 s</td></tr></tbody></table></div><nav class="pagination"><span class="pagination-range">1-25 of 84</span><label class="pagination-size"><span>Rows</span><select><option>25</option></select></label><div class="pagination-actions"><button class="icon-button" aria-label="Previous page">&lt;</button><span>Page 1 of 4</span><button class="icon-button" aria-label="Next page">&gt;</button></div></nav>`;
}
