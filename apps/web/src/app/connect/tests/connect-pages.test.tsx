import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConnectPage from "../page";
import { ConnectDonePage } from "../done";

it("the connect page links on to the panel's Devices and apps page, not a dead end", () => {
  const html = renderToStaticMarkup(<ConnectPage />);
  expect(html).toContain('href="/security/devices"');
  expect(html).toContain("Open FluxIQ");
});

it("the finish page, with hosted sign-in off, also links to the panel", () => {
  const html = renderToStaticMarkup(<ConnectDonePage />);
  expect(html).toContain('href="/security/devices"');
});
