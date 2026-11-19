import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RemoveKeyConfirm } from "../RemoveKeyConfirm";
import { ReplaceKeyForm } from "../ReplaceKeyForm";

describe("Remove and Replace on a saved key", () => {
  it("remove is one confirm press with no field to fill", () => {
    const html = renderToStaticMarkup(createElement(RemoveKeyConfirm, { keyName: "Work", onRemove: async () => ({ kind: "removed" as const }), onCancel: () => undefined }));
    expect(html).toContain("Remove key");
    expect(html).toContain("Keep it");
    expect(html).not.toContain("<input");
    expect(html).not.toMatch(/password/iu);
  });

  it("replace asks for the new key alone", () => {
    const html = renderToStaticMarkup(createElement(ReplaceKeyForm, { keyName: "Work", onReplace: async () => "", onDone: () => undefined, onCancel: () => undefined }));
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toContain("New key");
    expect(html).not.toContain("Your password");
    expect(html).toContain("Replace key");
    expect(html).toContain("Cancel");
  });
});
