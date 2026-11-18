import { afterEach, describe, expect, it, vi } from "vitest";
import SignupPage, { dynamic } from "../page";
import { SIGNUP_TERMS_VERSION } from "../server";

const OPEN = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.test", FLUXIQ_SIGNUP: "open" };

afterEach(() => vi.unstubAllEnvs());

describe("the sign-up page", () => {
  it("is read on every request, never at build time", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is not found while sign-up is off, including open off the service profile", () => {
    vi.stubEnv("FLUXIQ_SIGNUP", "open");
    expect(() => SignupPage()).toThrow(/NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK)/u);
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.example.test");
    vi.stubEnv("FLUXIQ_SIGNUP", "off");
    expect(() => SignupPage()).toThrow(/NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK)/u);
  });

  it("renders the form with the current terms version when open on service", () => {
    for (const [name, value] of Object.entries(OPEN)) vi.stubEnv(name, value);
    expect(SignupPage().props.children.props.termsVersion).toBe(SIGNUP_TERMS_VERSION);
  });
});
