import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { shapeKeyRow } from "../../model";
import { KeyAvailability } from "../KeyAvailability";

it.each([
  [{ state: "available" }, "Available"],
  [{ state: "unavailable", code: "legacy_recovery_required" }, "Saved key recovery required"],
  [{ state: "unavailable", code: "host_protection_unavailable" }, "Host key protection unavailable"],
  [{ state: "unavailable", code: "ciphertext_invalid" }, "Saved key could not be read"],
  [{ state: "unavailable", code: "future" }, "Availability not known"],
  [null, "Availability not known"]
])("shows saved-key cause %j without another authentication action", (availability, words) => {
  const row = shapeKeyRow({ id: "key", enabled: true, availability, secret: "PRIVATE" });
  const html = renderToStaticMarkup(createElement(KeyAvailability, { row }));
  expect(html).toContain(words);
  expect(html).not.toMatch(/password|unlock|PRIVATE/iu);
});

it("keeps explicit old lock metadata unavailable and disabled keys turned off", () => {
  const legacy = shapeKeyRow({ id: "key", enabled: true, unlocked: false });
  expect(renderToStaticMarkup(createElement(KeyAvailability, { row: legacy }))).toContain("FluxIQ update required");
  const disabled = shapeKeyRow({ id: "key", enabled: false, availability: { state: "available" } });
  expect(renderToStaticMarkup(createElement(KeyAvailability, { row: disabled }))).toContain("Turned off");
});
