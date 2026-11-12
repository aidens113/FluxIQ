import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("../../../../features/security", () => ({ SecurityPage: () => <div data-security-page>Security screen</div> }));
import SecurityRoute from "../page";

it("serves the Security screen, not the placeholder", () => {
  const html = renderToStaticMarkup(<SecurityRoute />);
  expect(html).toContain("data-security-page");
  expect(html).not.toContain("will be here");
});
