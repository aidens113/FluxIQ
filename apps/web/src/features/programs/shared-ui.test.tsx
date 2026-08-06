import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalContent, VisualAlert } from "./shared-ui";

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

  it("renders security failures with alert semantics", () => {
    const html = renderToStaticMarkup(<VisualAlert tone="error" title="Access denied" message="Fresh credentials are required." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Access denied");
    expect(html).toContain("Fresh credentials are required.");
  });
});
