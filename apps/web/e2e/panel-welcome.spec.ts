// The emailed welcome link's page in a real browser, signed out: a link that is missing, unknown or malformed says,
// in one plain sentence, that it is invalid, and offers no password form. Runs against the fixture host (see
// e2e/README.md); no model call is made and no account is created.
import { expect, test, type Page } from "@playwright/test";

const INVALID = /This link is invalid, already used or expired\./;
/** A token of the shape provisioning issues (43 base64url characters) that the engine never issued. */
const UNKNOWN_TOKEN = "Zm9yLXRlc3RzLW9ubHktbm90LWEtcmVhbC10b2tlbi0xMjM";

/** The sentence the page shows for the link, with what the describe call answered in the failure message if it is not that sentence. */
async function expectInvalidLink(page: Page, address: string, described: boolean) {
  const answered = described ? page.waitForResponse((response) => response.url().endsWith("/welcome/describe")) : null;
  await page.goto(address, { waitUntil: "domcontentloaded" });
  const message = page.locator("main p[role=alert]");
  if (answered) {
    const response = await answered;
    const code = ((await response.json().catch(() => ({}))) as { code?: string }).code;
    expect({ status: response.status(), code }, "what /welcome/describe answered").toEqual({ status: 400, code: "invalid_link" });
  }
  await expect(message).toContainText(INVALID, { timeout: 30_000 });
  await expect(message).toContainText("Ask whoever invited you");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set password and continue" })).toHaveCount(0);
}

test("a link with a malformed token shows the invalid-link message and no form", async ({ page }) => {
  await expectInvalidLink(page, "/welcome#token=not-a-real-invitation-token", true);
  expect(page.url()).not.toContain("not-a-real-invitation-token");
});

test("a link with a well-formed token the engine never issued shows the invalid-link message and no form", async ({ page }) => {
  await expectInvalidLink(page, `/welcome#token=${UNKNOWN_TOKEN}`, true);
  expect(page.url()).not.toContain(UNKNOWN_TOKEN);
});

// The two tests above fail on the panel today: opened at 127.0.0.1 (the address `next start --hostname 127.0.0.1` binds),
// /welcome/describe answers 403 "forbidden" because `isCrossSiteRequest` compares the browser's Origin with
// `new URL(request.url).origin`, which Next reports as http://localhost:<port>. The same page opened at that address works.
test("the same links opened at the address the server reports for itself show the invalid-link message", async ({ page, baseURL }) => {
  const own = `http://localhost:${new URL(baseURL!).port}`;
  await expectInvalidLink(page, `${own}/welcome#token=${UNKNOWN_TOKEN}`, true);
});

test("a link with no token shows the invalid-link message and no form", async ({ page }) => {
  await expectInvalidLink(page, "/welcome", false);
});

test("a link whose fragment holds no token shows the invalid-link message and no form", async ({ page }) => {
  await expectInvalidLink(page, "/welcome#other=1", false);
});

test("the welcome page needs no session and is not redirected to the panel", async ({ request }) => {
  const response = await request.get("/welcome", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
});
