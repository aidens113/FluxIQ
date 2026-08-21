import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalContent, titleFromTone, toneFromMessage, VisualAlert } from "./shared-ui";

describe("critical shared UI states", () => {
  it("renders privileged confirmations as an accessible modal", () => {
    const html = renderToStaticMarkup(
      <ModalContent title="Confirm privileged action" onClose={() => undefined}>
        <label>
          Password
          <input name="password" type="password" />
        </label>
        <button className="button button-primary" type="button">
          Confirm
        </button>
      </ModalContent>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Confirm privileged action");
    expect(html).toContain('type="password"');
  });

  it("routes visual alerts through the global viewport instead of inline markup", () => {
    const html = renderToStaticMarkup(<VisualAlert tone="error" title="Access denied" message="Fresh credentials are required." />);
    expect(html).toBe("");
    expect(toneFromMessage("Fresh credentials are required.")).toBe("error");
    expect(titleFromTone("error")).toBe("Action failed");
  });
});
