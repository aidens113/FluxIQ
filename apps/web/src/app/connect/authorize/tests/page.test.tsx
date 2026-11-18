import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareConnectConsent } from "../../../../features/connect/server";
import ConnectAuthorizePage from "../page";
import { LoginPanel } from "../../../AuthShell";

vi.mock("../../../../features/connect/server", () => ({ prepareConnectConsent: vi.fn() }));
vi.mock("../../../AuthShell", () => ({ LoginPanel: () => null }));
beforeEach(() => vi.clearAllMocks());

describe("authorize page", () => {
  it("renders sign-in without executing consent", async () => {
    vi.mocked(prepareConnectConsent).mockResolvedValue({ kind: "login", signUpUrl: null });
    const page = await ConnectAuthorizePage({ searchParams: Promise.resolve({ state: ["first", "second"] }) });
    expect(page.props.children[0].type).toBe(LoginPanel);
    const params = vi.mocked(prepareConnectConsent).mock.calls[0]![0];
    expect(params.getAll("state")).toEqual(["first", "second"]);
  });
});
