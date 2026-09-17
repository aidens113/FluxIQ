import { describe, expect, it } from "vitest";
import { screenAutomationStudioLlmEvidence } from "../evidence-screen.ts";

const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;

describe("screening evidence before it may reach a provider", () => {
  it("finds a declared key at any depth, in any spelling, and only as a key", () => {
    for (const value of [
      { html: "x" },
      { page: { elements: [{ inner_html: "x" }] } },
      [[{ OUTERHTML: "x" }]],
      { "page-source": "x" },
      { request: { Headers: {} } }
    ]) {
      expect(screenAutomationStudioLlmEvidence(value, WEB_DENIED_EVIDENCE_KEYS), JSON.stringify(value)).toEqual({ deniedKey: true, secretShaped: false });
    }
    expect(screenAutomationStudioLlmEvidence({ note: "copy the selector from the html" }, WEB_DENIED_EVIDENCE_KEYS)).toEqual({ deniedKey: false, secretShaped: false });
    expect(screenAutomationStudioLlmEvidence(["selector", "cookies"], WEB_DENIED_EVIDENCE_KEYS)).toEqual({ deniedKey: false, secretShaped: false });
    // A domain with nothing to deny declares so, and nothing is denied.
    expect(screenAutomationStudioLlmEvidence({ html: "x" }, [])).toEqual({ deniedKey: false, secretShaped: false });
  });

  it.each([
    ["a provider API key", "sk-4f9c2e7b1a6d3058e2c4b7a9d1f6e3c0"],
    ["a project-scoped API key", "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8t"],
    ["a bearer credential", "Authorization: Bearer mF_9.B5f-4.1JqM7xQ2pZ8vK3nR6tY0wL"],
    ["a JSON web token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLjQyIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"],
    ["a private key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
    ["an AWS access key", "AKIAIOSFODNN7EXAMPLE"],
    ["a GitHub token", "ghp_16C7e42F292c6912E7710c838347Ae178B4a"],
    ["a Slack token", "xoxb-2048-1234567890-AbCdEfGhIjKl"]
  ])("finds %s in a value or a key", (_label, secret) => {
    expect(screenAutomationStudioLlmEvidence({ page: { text: `before ${secret} after` } }, [])).toEqual({ deniedKey: false, secretShaped: true });
    expect(screenAutomationStudioLlmEvidence({ [secret]: true }, [])).toEqual({ deniedKey: false, secretShaped: true });
  });

  it("leaves ordinary page text alone", () => {
    for (const text of [
      "task-list-2024-quarterly-report-final-v2",
      "risk-assessment-000111222333444555",
      "Authorization: Bearer YOUR_API_TOKEN_HERE",
      "Use a Bearer token from your account settings.",
      "SKU-12345678901234567890ABC",
      "sk-SE",
      "eyJ is how a token starts",
      "-----BEGIN PUBLIC KEY-----",
      "AKIA",
      "ghp_short",
      "https://shop.example.test/checkout",
      "target.12"
    ]) {
      expect(screenAutomationStudioLlmEvidence({ schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", text }] }, WEB_DENIED_EVIDENCE_KEYS), text).toEqual({ deniedKey: false, secretShaped: false });
    }
  });

  it("reports both findings when both are present, and ends on a value that refers to itself", () => {
    expect(screenAutomationStudioLlmEvidence({ cookies: "sk-4f9c2e7b1a6d3058e2c4b7a9d1f6e3c0" }, WEB_DENIED_EVIDENCE_KEYS)).toEqual({ deniedKey: true, secretShaped: true });
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(screenAutomationStudioLlmEvidence(cyclic, WEB_DENIED_EVIDENCE_KEYS)).toEqual({ deniedKey: false, secretShaped: false });
  });
});
