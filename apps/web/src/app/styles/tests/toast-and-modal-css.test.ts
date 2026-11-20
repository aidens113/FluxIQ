import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const feedback = read("../global-foundation/04-feedback-and-status.css");
const modals = read("../global-foundation/15-modals-and-drawers.css");
const responsive = read("../global-responsive-certification.css");

describe("global styles", () => {
  it("places notices under the top bar, not over its Account button", () => {
    expect(feedback).toMatch(/\.global-alert-viewport \{[^}]*top: var\(--toast-top\)/u);
    expect(responsive).toMatch(/\.global-alert-viewport \{[^}]*--toast-top:[^}]*bottom: auto/u);
  });

  it("keeps dialog buttons from stretching tall when the footer stacks into a column", () => {
    expect(responsive).toMatch(/\.modal-actions > \.button \{[^}]*flex: none/u);
  });

  it("lets a dialog's footer rule reach both padded edges", () => {
    expect(modals).toMatch(/\.modal-panel \{[^}]*grid-template-columns: minmax\(0, 1fr\)/u);
  });
});
