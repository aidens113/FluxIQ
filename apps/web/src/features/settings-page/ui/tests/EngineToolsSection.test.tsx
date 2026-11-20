import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ENGINE_TOOLS, SETTINGS_TOOLS } from "../../model";
import { EngineToolsSection } from "../EngineToolsSection";

describe("EngineToolsSection", () => {
  it("lists every engine tool when the deployment's preset names none", () => {
    const html = renderToStaticMarkup(createElement(EngineToolsSection, {}));
    for (const tool of ENGINE_TOOLS) expect(html).toContain(`href="${tool.href}"`);
  });

  it("lists only the tools the preset passes", () => {
    const [kept, ...hidden] = SETTINGS_TOOLS;
    const html = renderToStaticMarkup(createElement(EngineToolsSection, { tools: [kept!] }));
    expect(html).toContain(`href="${kept!.href}"`);
    for (const tool of hidden) expect(html).not.toContain(`href="${tool.href}"`);
  });
});

describe("EngineToolsSection links", () => {
  it("names every link, so none reads as empty to a screen reader while Advanced is closed", () => {
    const html = renderToStaticMarkup(createElement(EngineToolsSection, {}));
    for (const tool of ENGINE_TOOLS) expect(html).toContain(`href="${tool.href}" aria-label="${tool.name}"`);
  });

  it("uses the shared chevron disclosure, not the browser's triangle", () => {
    expect(renderToStaticMarkup(createElement(EngineToolsSection, {}))).toContain('class="settings-advanced disclosure"');
  });
});
